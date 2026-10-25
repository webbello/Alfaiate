import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, unique } from './helpers';
import { worker } from './worker';
import { createTailorSession } from '../../src/modules/portal/session';
import { sendToInbox } from '../../src/modules/referral/inbox';

// FR-TPO-09..12 through the built Worker: a tailor sees only requests staff sent to them, what is asked before accepting, the customer only after accepting and only while it is open.
const db = env.DB;
const run = (sql: string, ...args: (string | number | null)[]) =>
  db
    .prepare(sql)
    .bind(...args)
    .run();
const SECRETS = [
  'Portal Fake Customer',
  '67070007777',
  'blue fake gate',
  'portal fake secret note',
];

async function tailor(label: string) {
  const k = unique();
  const tailorId = (
    await run(
      "INSERT INTO tailor (slug, display_name, status) VALUES (?, ?, 'approved')",
      `pin-${label}-${k}`,
      `Pin ${label} ${k}`,
    )
  ).meta.last_row_id;
  const accountId = (
    await run(
      'INSERT INTO tailor_account (tailor_id, email, password_hash, consent_at) VALUES (?, ?, ?, ?)',
      tailorId,
      `pin${k}@example.test`,
      'x',
      'now',
    )
  ).meta.last_row_id;
  const cookie = `__Host-alfaiate_tailor=${(await createTailorSession(db, accountId)).token}`;
  return { tailorId, accountId, cookie };
}
async function referral(tailorId: number, send = true) {
  const k = String(unique()).padStart(7, '0');
  await run(
    "INSERT OR IGNORE INTO garment_category (slug, name) VALUES ('pin-cat-fake', 'Pin Cat Fake')",
  );
  await run(
    "INSERT OR IGNORE INTO service_area (slug, name) VALUES ('pin-area-fake', 'Pin Area Fake')",
  );
  const enquiry = (
    await run(
      `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status,
         garment_category_id, area_id, area_text, preferred_datetime_text, notes)
       VALUES (?, 'Portal Fake Customer', '+67070007777', 'whatsapp', 1, 'v1', '2026-01-01T00:00:00Z', 'referred',
         (SELECT id FROM garment_category WHERE slug = 'pin-cat-fake'), (SELECT id FROM service_area WHERE slug = 'pin-area-fake'),
         'blue fake gate', 'This week', 'portal fake secret note')`,
      `AT-P${k}`,
    )
  ).meta.last_row_id;
  const id = (
    await run(
      'INSERT INTO referral (enquiry_id, tailor_id) VALUES (?, ?)',
      enquiry,
      tailorId,
    )
  ).meta.last_row_id;
  const staff = (
    await run(
      "INSERT INTO admin_user (email, password_hash, role) VALUES (?, 'x', 'manager')",
      `pinstaff${k}@example.test`,
    )
  ).meta.last_row_id;
  if (send)
    await sendToInbox(db, {
      enquiryId: enquiry,
      referralId: id,
      userId: staff,
    });
  return { id, enquiry, ref: `AT-P${k}` };
}
const get = (path: string, cookie?: string) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      headers: cookie ? { Cookie: cookie } : {},
      redirect: 'manual',
    }),
  );
const csrfOn = async (path: string, cookie: string) =>
  (await (await get(path, cookie)).text()).match(
    /name="csrf" value="([^"]+)"/,
  )?.[1] ?? '';
const answer = async (
  path: string,
  cookie: string,
  fields: Record<string, string>,
  csrf?: string,
) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { Origin: ORIGIN, Cookie: cookie },
      body: new URLSearchParams({
        csrf: csrf ?? (await csrfOn(path, cookie)),
        ...fields,
      }),
      redirect: 'manual',
    }),
  );
const noSecrets = (html: string) => {
  for (const s of SECRETS) expect(html, s).not.toContain(s);
};

describe('requests for you (portal)', () => {
  it('shows nothing until staff send it, then what is asked and not who asks, and counts it on the overview', async () => {
    const t = await tailor('a');
    const r = await referral(t.tailorId, false);
    const empty = await (await get('/portal/requests', t.cookie)).text();
    expect(empty).toContain('No requests yet');
    expect(empty).not.toContain(r.ref);
    expect((await get(`/portal/requests/${r.id}`, t.cookie)).status).toBe(404);
    await sendToInbox(db, {
      enquiryId: r.enquiry,
      referralId: r.id,
      userId: (await db
        .prepare('SELECT id FROM admin_user LIMIT 1')
        .first<{ id: number }>())!.id,
    });
    const list = await (await get('/portal/requests', t.cookie)).text();
    expect(list).toContain(r.ref);
    expect(list).toContain('Pin Cat Fake · Pin Area Fake');
    expect(list).toContain('When: This week');
    expect(list).toContain('Waiting for your answer');
    noSecrets(list);
    const overview = await (await get('/portal', t.cookie)).text();
    expect(overview).toContain('You have 1 request waiting for your answer.');
    const item = await get(`/portal/requests/${r.id}`, t.cookie);
    expect(item.headers.get('cache-control')).toBe('no-store');
    const html = await item.text();
    expect(html).toContain('Accept');
    expect(html).toContain('Decline');
    noSecrets(html);
  });

  it('is invisible to another tailor, to staff and to visitors, whatever id is tried', async () => {
    const a = await tailor('a');
    const b = await tailor('b');
    const r = await referral(a.tailorId);
    expect((await get(`/portal/requests/${r.id}`, b.cookie)).status).toBe(404);
    expect(
      noSecretsText(await (await get('/portal/requests', b.cookie)).text()),
    ).toBe(true);
    const postOther = await answer(
      `/portal/requests/${r.id}`,
      b.cookie,
      { answer: 'accept' },
      await csrfOn('/portal', b.cookie),
    );
    expect(postOther.status).toBe(404);
    expect((await get(`/portal/requests/${r.id}`)).status).toBe(302); // a visitor goes to the sign-in
    const stillWaiting = await (
      await get(`/portal/requests/${r.id}`, a.cookie)
    ).text();
    expect(stillWaiting).toContain('Accept'); // the other tailor's attempt changed nothing
  });

  it('accepting shows exactly what the customer shared with a contact link; declining never does; a closed request hides them', async () => {
    const t = await tailor('a');
    const r = await referral(t.tailorId);
    const path = `/portal/requests/${r.id}`;
    expect(
      (await answer(path, t.cookie, { answer: 'accept' }, 'wrong')).status,
    ).toBe(403);
    const ok = await answer(path, t.cookie, { answer: 'accept' });
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toContain('msg=accepted');
    const html = await (await get(path, t.cookie)).text();
    for (const s of SECRETS) expect(html, s).toContain(s);
    const wa = decodeURIComponent(
      /href="(https:\/\/wa\.me\/67070007777\?text=[^"]+)"/
        .exec(html.replaceAll('&#38;', '&'))![1]!
        .split('text=')[1]!,
    );
    expect(wa).toContain(r.ref);
    expect(wa).not.toContain('Portal Fake');
    expect(
      (await answer(path, t.cookie, { answer: 'decline' })).headers.get(
        'location',
      ),
    ).toContain('msg=already_answered');
    await run(
      "UPDATE enquiry SET status = 'cancelled' WHERE id = ?",
      r.enquiry,
    );
    const closed = await (await get(path, t.cookie)).text();
    expect(closed).toContain('This request is closed');
    noSecrets(closed);

    const d = await referral(t.tailorId);
    const dpath = `/portal/requests/${d.id}`;
    const declined = await answer(dpath, t.cookie, {
      answer: 'decline',
      reason: 'too_far',
    });
    expect(declined.headers.get('location')).toContain('msg=declined');
    const dhtml = await (await get(dpath, t.cookie)).text();
    expect(dhtml).toContain('You declined this request');
    noSecrets(dhtml);
    const bad = await referral(t.tailorId);
    expect(
      (
        await answer(`/portal/requests/${bad.id}`, t.cookie, {
          answer: 'decline',
          reason: 'because',
        })
      ).headers.get('location'),
    ).toContain('msg=invalid');
  });
});

describe('answering is rate limited', () => {
  it('stops a tailor who posts too often', async () => {
    const t = await tailor('rl');
    const r = await referral(t.tailorId);
    const path = `/portal/requests/${r.id}`;
    const csrf = await csrfOn(path, t.cookie);
    let last = '';
    for (let i = 0; i < 32; i++)
      last =
        (await answer(path, t.cookie, { answer: 'maybe' }, csrf)).headers.get(
          'location',
        ) ?? '';
    expect(last).toContain('msg=limited');
  });
});
const noSecretsText = (html: string) => SECRETS.every((s) => !html.includes(s));
