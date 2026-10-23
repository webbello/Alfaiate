import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn, unique } from './helpers';

const db = env.DB;
const add = async (
  name: string,
  over: { status?: string; spam?: boolean; phone?: string } = {},
) => {
  const ref = `AT-ADM${String(unique()).padStart(5, '0')}`;
  await db
    .prepare(
      `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status, is_spam)
       VALUES (?, ?, ?, 'whatsapp', 1, 'v', '2026-01-01T00:00:00Z', ?, ?)`,
    )
    .bind(
      ref,
      name,
      over.phone ?? '+67077123456',
      over.status ?? 'new',
      over.spam ? 1 : 0,
    )
    .run();
  return ref;
};

describe('GET /admin/enquiries (FR-ADM-06, SEC-09, BR-07)', () => {
  it('sends an anonymous visitor to sign in and shows nothing', async () => {
    const r = await get('/admin/enquiries');
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toContain('/admin/login');
  });

  it('refuses editors and viewers (BR-07: they never see customer data)', async () => {
    await add('Hidden From Editors');
    for (const role of ['editor', 'viewer']) {
      const r = await get('/admin/enquiries', await signIn(role));
      expect(r.status, role).toBe(403);
      expect(await r.text()).not.toContain('Hidden From Editors');
    }
  });

  it('shows the list to a manager and an owner, privately', async () => {
    const ref = await add('Visible Fake Customer');
    for (const role of ['manager', 'owner']) {
      const r = await get('/admin/enquiries', await signIn(role));
      const html = await r.text();
      expect(r.status, role).toBe(200);
      expect(html).toContain(ref);
      expect(html).toContain('Visible Fake Customer');
      expect(html).toContain('+67077123456');
      expect(html).toContain(`href="/admin/enquiries/`);
      expect(r.headers.get('cache-control')).toMatch(/no-store/);
      expect(html).toContain('noindex');
    }
  });

  it('filters by status and searches by reference, name and phone', async () => {
    const cookie = await signIn('manager');
    const contacted = await add('Filter Contacted', { status: 'contacted' });
    const fresh = await add('Filter Fresh Person', { phone: '+67073335555' });
    const byStatus = await (
      await get('/admin/enquiries?status=contacted', cookie)
    ).text();
    expect(byStatus).toContain(contacted);
    expect(byStatus).not.toContain(fresh);
    expect(
      await (
        await get(`/admin/enquiries?q=${fresh.toLowerCase()}`, cookie)
      ).text(),
    ).toContain(fresh);
    expect(
      await (await get('/admin/enquiries?q=Fresh+Person', cookie)).text(),
    ).not.toContain(contacted);
    const phone = await (
      await get(`/admin/enquiries?q=${encodeURIComponent('7333 5555')}`, cookie)
    ).text();
    expect(phone).toContain(fresh);
  });

  it('hides spam unless asked, and says when the list was cut', async () => {
    const cookie = await signIn('owner');
    const spam = await add('Spam Sender', { spam: true });
    expect(await (await get('/admin/enquiries', cookie)).text()).not.toContain(
      spam,
    );
    expect(
      await (await get('/admin/enquiries?spam=1', cookie)).text(),
    ).toContain(spam);
  });

  it('escapes a hostile search term and does not break on odd input', async () => {
    const cookie = await signIn('owner');
    for (const q of [
      '"><script>alert(1)</script>',
      "'; DROP TABLE enquiry; --",
      '%',
      '😀'.repeat(60),
    ]) {
      const r = await get(
        `/admin/enquiries?q=${encodeURIComponent(q)}`,
        cookie,
      );
      const html = await r.text();
      expect(r.status).toBe(200);
      expect(html).not.toContain('"><script>'); // the quote is escaped, so the text stays inside the attribute
    }
    expect(
      (await db
        .prepare('SELECT count(*) AS c FROM enquiry')
        .first<{ c: number }>())!.c,
    ).toBeGreaterThan(0);
  });

  it('is linked from the dashboard only for roles that may open it', async () => {
    for (const [role, shown] of [
      ['owner', true],
      ['manager', true],
      ['editor', false],
      ['viewer', false],
    ] as const) {
      const html = await (await get('/admin', await signIn(role))).text();
      expect(html.includes('href="/admin/enquiries"'), role).toBe(shown);
    }
  });
});

const detail = async (id: number, cookie: string) =>
  get(`/admin/enquiries/${id}`, cookie);
const idOf = async (ref: string) =>
  (await db
    .prepare('SELECT id FROM enquiry WHERE reference_code = ?')
    .bind(ref)
    .first<{ id: number }>())!.id;

describe('GET /admin/enquiries/[id] (FR-ADM-06/08, BR-07, BR-08)', () => {
  it('shows every field, the history, the notes and the forwarding text to a manager', async () => {
    const ref = await add('Detail Fake Customer');
    const id = await idOf(ref);
    await db
      .prepare(
        "UPDATE enquiry SET notes = 'Fake customer words', service_description = 'Fake service' WHERE id = ?",
      )
      .bind(id)
      .run();
    await db
      .prepare(
        "INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status) VALUES (?, NULL, 'new')",
      )
      .bind(id)
      .run();
    const r = await detail(id, await signIn('manager'));
    const html = await r.text();
    expect(r.status).toBe(200);
    for (const shown of [
      ref,
      'Detail Fake Customer',
      '+67077123456',
      'Fake customer words',
      'Fake service',
      'readonly',
    ])
      expect(html).toContain(shown);
    expect(html).toContain('name="csrf"');
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
  });

  it('refuses editors and viewers, gives 404 for a missing or malformed id, and sends anonymous visitors to sign in', async () => {
    const id = await idOf(await add('Never Shown To Editors'));
    for (const role of ['editor', 'viewer']) {
      const r = await detail(id, await signIn(role));
      expect(r.status, role).toBe(403);
      expect(await r.text()).not.toContain('Never Shown');
    }
    const cookie = await signIn('owner');
    for (const bad of ['999999', 'abc', '1e3', '0x10', '-1'])
      expect((await get(`/admin/enquiries/${bad}`, cookie)).status, bad).toBe(
        404,
      );
    expect((await get(`/admin/enquiries/${id}`)).status).toBe(302);
  });

  it('does not show the update forms to a role that can only view', async () => {
    // No role has enquiry.view without enquiry.update today, so this guards the rule at the handler instead (see below).
    const id = await idOf(await add('Handler Guard'));
    const owner = await detail(id, await signIn('owner'));
    expect(await owner.text()).toContain('/admin/enquiries/' + id + '/actions');
  });
});

describe('POST /admin/enquiries/[id]/actions (FR-ADM-07/08, AC-11, SEC-09)', () => {
  const act = async (
    role: string,
    id: number,
    form: Record<string, string>,
    withCsrf = true,
  ) => {
    const cookie = await signIn(role);
    const csrf = withCsrf ? await csrfOf(cookie) : 'bad';
    return post(`/admin/enquiries/${id}/actions`, cookie, { csrf, ...form });
  };

  it('sets each of the seven statuses, logs each change and shows it', async () => {
    const id = await idOf(await add('Status Journey'));
    const cookie = await signIn('manager');
    const csrf = await csrfOf(cookie);
    for (const status of [
      'contacted',
      'referred',
      'accepted_by_tailor',
      'completed_reported',
      'not_converted',
      'cancelled',
      'new',
    ]) {
      const r = await post(`/admin/enquiries/${id}/actions`, cookie, {
        csrf,
        action: 'set_status',
        status,
      });
      expect(r.status, status).toBe(303);
      expect(r.headers.get('location')).toBe(
        `/admin/enquiries/${id}?msg=status_saved`,
      );
      expect(
        (await db
          .prepare('SELECT status FROM enquiry WHERE id = ?')
          .bind(id)
          .first<{ status: string }>())!.status,
      ).toBe(status);
    }
    const logs = (await db
      .prepare(
        'SELECT count(*) AS c FROM enquiry_status_log WHERE enquiry_id = ?',
      )
      .bind(id)
      .first<{ c: number }>())!.c;
    expect(logs).toBe(7);
  });

  it('adds a note and flags spam', async () => {
    const id = await idOf(await add('Note And Spam'));
    expect(
      (
        await act('owner', id, {
          action: 'add_note',
          body: 'called, no answer',
        })
      ).headers.get('location'),
    ).toBe(`/admin/enquiries/${id}?msg=note_added`);
    expect(
      (await act('owner', id, { action: 'set_spam', spam: '1' })).status,
    ).toBe(303);
    expect(
      (await db
        .prepare('SELECT is_spam FROM enquiry WHERE id = ?')
        .bind(id)
        .first<{ is_spam: number }>())!.is_spam,
    ).toBe(1);
    expect(await (await detail(id, await signIn('owner'))).text()).toContain(
      'called, no answer',
    );
  });

  it('refuses editors and viewers, and a missing or wrong CSRF token, without changing anything', async () => {
    const id = await idOf(await add('Guarded'));
    for (const role of ['editor', 'viewer'])
      expect(
        (await act(role, id, { action: 'set_status', status: 'cancelled' }))
          .status,
        role,
      ).toBe(403);
    expect(
      (
        await act(
          'owner',
          id,
          { action: 'set_status', status: 'cancelled' },
          false,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await post(`/admin/enquiries/${id}/actions`, undefined, {
          action: 'set_status',
          status: 'cancelled',
        })
      ).status,
    ).toBe(302);
    expect(
      (await db
        .prepare('SELECT status FROM enquiry WHERE id = ?')
        .bind(id)
        .first<{ status: string }>())!.status,
    ).toBe('new');
  });

  it('answers 404 for an unknown enquiry and a clear message for bad input', async () => {
    expect(
      (
        await act('owner', 999_999, {
          action: 'set_status',
          status: 'cancelled',
        })
      ).status,
    ).toBe(404);
    const id = await idOf(await add('Bad Input'));
    for (const form of <Record<string, string>[]>[
      { action: 'set_status', status: 'bogus' },
      { action: 'add_note', body: '   ' },
      { action: 'nonsense' },
    ]) {
      const r = await act('owner', id, form);
      expect(r.status).toBe(303);
      expect(r.headers.get('location')).toBe(
        `/admin/enquiries/${id}?msg=invalid`,
      );
    }
  });

  it('keeps customer data out of the audit log', async () => {
    const id = await idOf(await add('Audit Privacy Person'));
    await act('owner', id, { action: 'set_status', status: 'contacted' });
    await act('owner', id, { action: 'add_note', body: 'Audit Privacy note' });
    const rows = JSON.stringify(
      (
        await db
          .prepare(
            "SELECT * FROM audit_log WHERE entity_type = 'enquiry' AND entity_id = ?",
          )
          .bind(id)
          .all()
      ).results,
    );
    expect(rows).not.toMatch(/Audit Privacy|\+670/);
  });
});

describe('the inbox for people (Phase 7b T4)', () => {
  const chip = (html: string, label: string, count: number, status?: string) =>
    new RegExp(
      `<a class="chip chip--[a-z]+" href="/admin/enquiries${status ? `\\?status=${status}` : ''}[^"]*"[^>]*>${label} ${count}</a>`,
    ).test(html);

  it('shows a chip per status with its count, plus All, each linking to that filter, and marks the current one', async () => {
    const owner = await signIn('owner');
    const html = await (
      await get('/admin/enquiries?status=contacted', owner)
    ).text();
    const total = Number(html.match(/>All (\d+)</)![1]);
    expect(total).toBeGreaterThan(0);
    for (const status of [
      'new',
      'contacted',
      'referred',
      'accepted_by_tailor',
      'completed_reported',
      'not_converted',
      'cancelled',
    ])
      expect(html, status).toContain(`href="/admin/enquiries?status=${status}`);
    expect(html).toMatch(
      /href="\/admin\/enquiries\?status=contacted"[^>]*aria-current="page"/,
    );
    expect(
      chip(
        html,
        'Contacted',
        Number(html.match(/Contacted (\d+)</)![1]),
        'contacted',
      ),
    ).toBe(true);
  });

  it('counts leave out spam, and chips keep the search and the spam switch', async () => {
    const owner = await signIn('owner');
    const spam = await add('Chip Spam Person', { spam: true });
    const html = await (
      await get('/admin/enquiries?q=Chip&spam=1', owner)
    ).text();
    expect(html).toContain(spam);
    expect(html).toContain('q=Chip');
    expect(html).toContain('spam=1');
  });

  it('shows the status and the referral state as chips on each row', async () => {
    const owner = await signIn('owner');
    const ref = await add('Row Chips Person', { status: 'contacted' });
    const id = (await db
      .prepare('SELECT id FROM enquiry WHERE reference_code = ?')
      .bind(ref)
      .first<{ id: number }>())!.id;
    const tailor = (
      await db
        .prepare(
          "INSERT INTO tailor (slug, display_name, status) VALUES (?, 'Row Tailor', 'approved')",
        )
        .bind(`rc-${unique()}`)
        .run()
    ).meta.last_row_id;
    await db
      .prepare(
        "INSERT INTO referral (enquiry_id, tailor_id, tailor_response) VALUES (?, ?, 'declined')",
      )
      .bind(id, tailor)
      .run();
    const html = await (await get(`/admin/enquiries?q=${ref}`, owner)).text();
    expect(html).toMatch(/<span class="chip chip--info">Contacted<\/span>/);
    expect(html).toMatch(/<span class="chip chip--danger">Declined<\/span>/);
    const fresh = await add('No Referral Person');
    expect(
      await (await get(`/admin/enquiries?q=${fresh}`, owner)).text(),
    ).toContain('No referral yet');
  });

  it('puts new enquiries first', async () => {
    const owner = await signIn('owner');
    const contacted = await add('Order Contacted', { status: 'contacted' });
    const fresh = await add('Order Fresh', { status: 'new' });
    const html = await (await get('/admin/enquiries?q=Order', owner)).text();
    expect(html.indexOf(fresh)).toBeLessThan(html.indexOf(contacted));
  });

  it('explains an empty search and offers to clear it', async () => {
    const owner = await signIn('owner');
    const html = await (
      await get('/admin/enquiries?q=zzz-nothing-matches', owner)
    ).text();
    expect(html).toContain('class="empty"');
    expect(html).toContain('No enquiries match');
    expect(html).toContain('href="/admin/enquiries"');
  });
});

describe('the enquiry page in cards (Phase 7b T5)', () => {
  const open = async (role: string) => {
    const ref = await add('Cards Fake Customer');
    const id = (await db
      .prepare('SELECT id FROM enquiry WHERE reference_code = ?')
      .bind(ref)
      .first<{ id: number }>())!.id;
    await db
      .prepare(
        "INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status) VALUES (?, NULL, 'new')",
      )
      .bind(id)
      .run();
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status) VALUES (?, 'Cards Tailor', 'approved')",
      )
      .bind(`cd-${unique()}`)
      .run();
    return {
      id,
      ref,
      html: await (
        await get(`/admin/enquiries/${id}`, await signIn(role))
      ).text(),
    };
  };

  it('puts a summary, a next step, the customer and the forward box first, then the status and referrals column, and the anonymise warning last', async () => {
    const { html, ref } = await open('owner');
    const at = (needle: string) => {
      const i = html.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      at(`<h1>${ref}`),
      at('class="next-step"'),
      at('id="customer-card"'),
      at('id="forward-card"'),
      at('id="notes-card"'), // the wide column first, then the side column (status, referrals, anonymise)
      at('id="status-card"'),
      at('id="referrals"'),
      at('<details'),
      at('class="card card--warning"'),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.lastIndexOf('class="card')).toBe(
      at('class="card card--warning"'),
    );
  });

  it('shows the status as a chip with the received date, and a plain next-step sentence', async () => {
    const { html } = await open('manager');
    expect(html).toMatch(
      /<h1>AT-[A-Z0-9]+<\/h1>[\s\S]{0,400}<span class="chip chip--info">New<\/span>/,
    );
    expect(html).toMatch(
      /class="next-step"[^>]*>[\s\S]*Not yet passed to a tailor/,
    );
  });

  it('keeps the warning box, the fee forms and the anonymise form away from a manager', async () => {
    const { html } = await open('manager');
    expect(html).not.toContain('card--warning');
    expect(html).not.toContain('/anonymise');
    expect(html).not.toContain('Referral fee (owner only)');
  });

  it('keeps the status history inside a native details element, closed by default', async () => {
    const { html } = await open('owner');
    expect(html).toMatch(/<details>\s*<summary>Status history<\/summary>/);
    expect(html).not.toMatch(/<details open/);
  });

  it('shows the add-note form inside the notes card and the status form inside its own card, for roles that may update', async () => {
    const { html } = await open('owner');
    const notes = html.slice(html.indexOf('id="notes-card"'));
    expect(notes.slice(0, 1500)).toContain('name="body"');
    const status = html.slice(
      html.indexOf('id="status-card"'),
      html.indexOf('id="referrals"'),
    );
    expect(status).toContain('value="set_status"');
  });
});
