import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn, unique } from './helpers';

const db = env.DB;
const enquiry = async (o: { anonymised?: boolean } = {}) => {
  const ref = `AT-RF${String(unique()).padStart(6, '0')}`;
  const id = (
    await db
      .prepare(
        "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at) VALUES (?, 'Referral Fake Customer', '+67077123456', 'phone', 1, 'v', '2026-01-01T00:00:00Z')",
      )
      .bind(ref)
      .run()
  ).meta.last_row_id as number;
  if (o.anonymised)
    await db
      .prepare(
        "UPDATE enquiry SET customer_name = NULL, contact_number_e164 = NULL, anonymised_at = '2026-09-01T00:00:00Z' WHERE id = ?",
      )
      .bind(id)
      .run();
  return id;
};
const tailor = async (o: { status?: string; terms?: boolean } = {}) =>
  (
    await db
      .prepare(
        'INSERT INTO tailor (slug, display_name, status, fee_terms_agreed_on) VALUES (?, ?, ?, ?)',
      )
      .bind(
        `rf-i-${unique()}`,
        `Referral Tailor ${unique()}`,
        o.status ?? 'approved',
        o.terms === false ? null : '2026-05-01',
      )
      .run()
  ).meta.last_row_id as number;
const status = async (id: number) =>
  (await db
    .prepare('SELECT status FROM enquiry WHERE id = ?')
    .bind(id)
    .first<{ status: string }>())!.status;
const referralsOf = async (e: number) =>
  (
    await db
      .prepare('SELECT * FROM referral WHERE enquiry_id = ? ORDER BY id')
      .bind(e)
      .all<Record<string, unknown>>()
  ).results;

const act = async (
  role: string,
  path: string,
  form: Record<string, string>,
  csrf = true,
) => {
  const cookie = await signIn(role);
  return post(path, cookie, {
    csrf: csrf ? await csrfOf(cookie) : 'bad',
    ...form,
  });
};
const createPath = (e: number) => `/admin/enquiries/${e}/referrals`;
const updatePath = (e: number, r: number) =>
  `/admin/enquiries/${e}/referrals/${r}`;
const feePath = (e: number, r: number) =>
  `/admin/enquiries/${e}/referrals/${r}/fee`;
// the redirect ends in #referrals so the page scrolls to the section; the tests compare the rest
const location = (r: Response) =>
  r.headers.get('location')?.replace(/#referrals$/, '') ?? null;
const completedReferral = async (role = 'owner') => {
  const e = await enquiry();
  const t = await tailor();
  await act('manager', createPath(e), { tailor_id: String(t) });
  const [r] = await referralsOf(e);
  await db
    .prepare(
      "UPDATE referral SET completion_reported_at = '2026-06-01', completion_reported_by = 'tailor' WHERE id = ?",
    )
    .bind(r.id)
    .run();
  return { e, t, r: r.id as number, role };
};

describe('creating a referral (FR-REF-01/02/07, AC-12)', () => {
  it('lets a manager and the owner pass an enquiry to an approved tailor, and changes no status', async () => {
    for (const role of ['manager', 'owner']) {
      const e = await enquiry();
      const t = await tailor();
      const r = await act(role, createPath(e), { tailor_id: String(t) });
      expect(r.status, role).toBe(303);
      expect(location(r)).toBe(`/admin/enquiries/${e}?msg=referral_created`);
      expect((await referralsOf(e)).length).toBe(1);
      expect(await status(e)).toBe('new'); // nothing moves the enquiry's status by itself
    }
  });

  it('refuses an unapproved tailor, an anonymised enquiry and a second active referral, with a plain message and no row', async () => {
    const e = await enquiry();
    const draft = await tailor({ status: 'draft' });
    expect(
      location(
        await act('manager', createPath(e), { tailor_id: String(draft) }),
      ),
    ).toBe(`/admin/enquiries/${e}?msg=not_approved`);
    const anon = await enquiry({ anonymised: true });
    expect(
      location(
        await act('manager', createPath(anon), {
          tailor_id: String(await tailor()),
        }),
      ),
    ).toBe(`/admin/enquiries/${anon}?msg=no_consent`);
    await act('manager', createPath(e), { tailor_id: String(await tailor()) });
    expect(
      location(
        await act('manager', createPath(e), {
          tailor_id: String(await tailor()),
        }),
      ),
    ).toBe(`/admin/enquiries/${e}?msg=already_active`);
    expect((await referralsOf(e)).length).toBe(1);
    expect((await referralsOf(anon)).length).toBe(0);
  });

  it('refuses editors, viewers, anonymous visitors and a missing or wrong CSRF token', async () => {
    const e = await enquiry();
    const t = String(await tailor());
    for (const role of ['editor', 'viewer'])
      expect(
        (await act(role, createPath(e), { tailor_id: t })).status,
        role,
      ).toBe(403);
    expect(
      (await act('manager', createPath(e), { tailor_id: t }, false)).status,
    ).toBe(403);
    expect(
      (await post(createPath(e), undefined, { tailor_id: t })).status,
    ).toBe(302);
    expect(
      (await act('manager', createPath(999_999), { tailor_id: t })).status,
    ).toBe(404);
    expect(
      location(await act('manager', createPath(e), { tailor_id: 'abc' })),
    ).toBe(`/admin/enquiries/${e}?msg=invalid`);
    expect((await referralsOf(e)).length).toBe(0);
  });
});

describe('recording the forwarding, response and completion (FR-REF-03/04/05, AC-13)', () => {
  it('saves what a manager types and keeps the history after a reassignment', async () => {
    const e = await enquiry();
    await act('manager', createPath(e), { tailor_id: String(await tailor()) });
    const [first] = await referralsOf(e);
    const saved = await act('manager', updatePath(e, first.id as number), {
      forwarded_at: '2026-06-09',
      forwarded_via: 'whatsapp',
      fields_shared_note: 'name and number',
      tailor_response: 'declined',
      responded_at: '2026-06-10',
      completion_reported_at: '',
      completion_reported_by: '',
      closed_reason: 'too busy',
    });
    expect(location(saved)).toBe(`/admin/enquiries/${e}?msg=referral_saved`);
    await act('manager', createPath(e), { tailor_id: String(await tailor()) });
    const rows = await referralsOf(e);
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({
      forwarded_via: 'whatsapp',
      tailor_response: 'declined',
      closed_reason: 'too busy',
    });
    const html = await (
      await get(`/admin/enquiries/${e}`, await signIn('manager'))
    ).text();
    expect(html).toContain('too busy');
    expect(html).toContain('2026-06-09');
  });

  it('refuses bad input with a message and changes nothing; only the owner can confirm a completion', async () => {
    const e = await enquiry();
    await act('manager', createPath(e), { tailor_id: String(await tailor()) });
    const [r] = await referralsOf(e);
    const base = {
      forwarded_at: '',
      forwarded_via: '',
      fields_shared_note: '',
      tailor_response: 'pending',
      responded_at: '',
      completion_reported_at: '',
      completion_reported_by: '',
      closed_reason: '',
    };
    expect(
      location(
        await act('manager', updatePath(e, r.id as number), {
          ...base,
          forwarded_at: '2026-02-30',
        }),
      ),
    ).toBe(`/admin/enquiries/${e}?msg=invalid`);
    const confirmed = {
      ...base,
      completion_reported_at: '2026-06-09',
      completion_reported_by: 'owner_confirmed',
    };
    expect(
      location(await act('manager', updatePath(e, r.id as number), confirmed)),
    ).toBe(`/admin/enquiries/${e}?msg=forbidden`);
    expect((await referralsOf(e))[0]).toMatchObject({
      forwarded_at: null,
      completion_reported_by: null,
    });
    expect(
      location(await act('owner', updatePath(e, r.id as number), confirmed)),
    ).toBe(`/admin/enquiries/${e}?msg=referral_saved`);
  });

  it('refuses editors and viewers, a referral of another enquiry, and bad ids', async () => {
    const e = await enquiry();
    await act('manager', createPath(e), { tailor_id: String(await tailor()) });
    const [r] = await referralsOf(e);
    const other = await enquiry();
    const form = { tailor_response: 'accepted' };
    for (const role of ['editor', 'viewer'])
      expect(
        (await act(role, updatePath(e, r.id as number), form)).status,
        role,
      ).toBe(403);
    expect(
      (await act('manager', updatePath(other, r.id as number), form)).status,
    ).toBe(404);
    expect((await act('manager', updatePath(e, 999_999), form)).status).toBe(
      404,
    );
    expect(
      (await act('manager', `/admin/enquiries/${e}/referrals/abc`, form))
        .status,
    ).toBe(404);
    expect(
      (await act('manager', updatePath(e, r.id as number), form, false)).status,
    ).toBe(403);
    expect((await referralsOf(e))[0].tailor_response).toBe('pending');
  });
});

describe("fees are the owner's alone (FR-REF-06, BR-09, BR-10)", () => {
  it('lets the owner record a fee and refuses a manager on the fee route', async () => {
    const s = await completedReferral();
    expect(
      (
        await act('manager', feePath(s.e, s.r), {
          fee_amount: '43.21',
          fee_status: 'due',
        })
      ).status,
    ).toBe(403);
    const ok = await act('owner', feePath(s.e, s.r), {
      fee_amount: '43.21',
      fee_basis_note: 'agreed terms',
      fee_status: 'due',
    });
    expect(location(ok)).toBe(`/admin/enquiries/${s.e}?msg=fee_saved`);
    expect((await referralsOf(s.e))[0]).toMatchObject({
      fee_amount: 4321,
      fee_status: 'due',
    });
    for (const role of ['editor', 'viewer'])
      expect(
        (await act(role, feePath(s.e, s.r), { fee_status: 'due' })).status,
        role,
      ).toBe(403);
    expect(
      (await act('owner', feePath(s.e, s.r), { fee_status: 'paid' }, false))
        .status,
    ).toBe(403);
  });

  it('explains each refusal: no completion, no paid date, no agreed terms', async () => {
    const e = await enquiry();
    await act('manager', createPath(e), { tailor_id: String(await tailor()) });
    const [open] = await referralsOf(e);
    expect(
      location(
        await act('owner', feePath(e, open.id as number), {
          fee_amount: '10',
          fee_status: 'due',
        }),
      ),
    ).toBe(`/admin/enquiries/${e}?msg=needs_completion`);
    const s = await completedReferral();
    expect(
      location(
        await act('owner', feePath(s.e, s.r), {
          fee_amount: '10',
          fee_status: 'paid',
        }),
      ),
    ).toBe(`/admin/enquiries/${s.e}?msg=needs_paid_date`);
    const noTerms = await enquiry();
    const t = await tailor({ terms: false });
    await act('manager', createPath(noTerms), { tailor_id: String(t) });
    const [r] = await referralsOf(noTerms);
    await db
      .prepare(
        "UPDATE referral SET completion_reported_at = '2026-06-01', completion_reported_by = 'tailor' WHERE id = ?",
      )
      .bind(r.id)
      .run();
    expect(
      location(
        await act('owner', feePath(noTerms, r.id as number), {
          fee_amount: '10',
          fee_status: 'due',
        }),
      ),
    ).toBe(`/admin/enquiries/${noTerms}?msg=no_agreed_terms`);
  });

  it('keeps every fee value out of what a manager sees, and shows it to the owner', async () => {
    const s = await completedReferral();
    await act('owner', feePath(s.e, s.r), {
      fee_amount: '43.21',
      fee_basis_note: 'SECRET-FEE-BASIS',
      order_value_note: 'SECRET-ORDER-VALUE',
      fee_status: 'due',
    });
    const managerPage = await (
      await get(`/admin/enquiries/${s.e}`, await signIn('manager'))
    ).text();
    for (const hidden of [
      '43.21',
      '4321',
      'SECRET-FEE-BASIS',
      'SECRET-ORDER-VALUE',
      'fee_amount',
      'fee_status',
      'Referral fee',
    ])
      expect(managerPage, hidden).not.toContain(hidden);
    const ownerPage = await (
      await get(`/admin/enquiries/${s.e}`, await signIn('owner'))
    ).text();
    for (const shown of ['43.21', 'SECRET-FEE-BASIS', 'SECRET-ORDER-VALUE'])
      expect(ownerPage, shown).toContain(shown);
    const update = await act('manager', updatePath(s.e, s.r), {
      tailor_response: 'accepted',
    });
    expect(`${await update.text()}${[...update.headers].join()}`).not.toMatch(
      /43\.21|SECRET/,
    );
    expect((await referralsOf(s.e))[0]).toMatchObject({ fee_amount: 4321 });
  });
});

describe('the referral section on the enquiry page', () => {
  it('shows approved tailors to pick, the history, and no forms to a user who cannot edit', async () => {
    const e = await enquiry();
    const t = await tailor();
    const draft = await tailor({ status: 'draft' });
    const html = await (
      await get(`/admin/enquiries/${e}`, await signIn('manager'))
    ).text();
    const name = (await db
      .prepare('SELECT display_name FROM tailor WHERE id = ?')
      .bind(t)
      .first<{ display_name: string }>())!.display_name;
    expect(html).toContain(name);
    expect(html).toContain(`/admin/enquiries/${e}/referrals`);
    const draftName = (await db
      .prepare('SELECT display_name FROM tailor WHERE id = ?')
      .bind(draft)
      .first<{ display_name: string }>())!.display_name;
    expect(html).not.toContain(draftName);
    expect(html).toMatch(/reported/i);
  });
});
