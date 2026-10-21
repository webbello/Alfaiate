import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, csrfOf, get, signIn, unique } from './helpers';
import { worker } from './worker';

// FR-TPO-01/02 through the real handlers.
const db = env.DB;
const interest = async () => {
  const ref = `JN-PA${String(unique()).padStart(6, '0')}`;
  await db
    .prepare(
      "INSERT INTO tailor_interest (reference_code, contact_name, business_name, phone_e164, consent_contact, consent_text_version, consent_at) VALUES (?, 'Approve Fake', 'Approve Atelier Fake', '+67077123456', 1, 'v', 'now')",
    )
    .bind(ref)
    .run();
  return (await db
    .prepare('SELECT id FROM tailor_interest WHERE reference_code = ?')
    .bind(ref)
    .first<{ id: number }>())!.id;
};
const post = async (path: string, cookie: string, withCsrf = true) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: ORIGIN },
      body: new URLSearchParams(withCsrf ? { csrf: await csrfOf(cookie) } : {}),
      redirect: 'manual',
    }),
  );

describe('approving a join request', () => {
  it('shows the one-time link once, makes a draft tailor, and a second click makes nothing more', async () => {
    const id = await interest();
    const cookie = await signIn('manager');
    const r = await post(`/admin/interest/${id}/approve`, cookie);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('no-store');
    const html = await r.text();
    const link =
      /value="(https?:\/\/[^"]+\/portal\/accept\?token=[A-Za-z0-9_-]+)"/.exec(
        html,
      )?.[1];
    expect(link).toBeTruthy();
    const again = await post(`/admin/interest/${id}/approve`, cookie);
    expect(again.status).toBe(303);
    expect(again.headers.get('location')).toContain('interest_already_decided');
    const tailors = await db
      .prepare(
        "SELECT count(*) AS c FROM tailor WHERE display_name = 'Approve Atelier Fake'",
      )
      .first<{ c: number }>();
    expect(tailors!.c).toBe(1);
    // the token is nowhere in the database or the audit log in plain form
    const token = link!.split('token=')[1];
    for (const table of [
      'tailor_invite',
      'audit_log',
      'tailor_account',
      'tailor_interest',
    ])
      expect(
        JSON.stringify(
          (await db.prepare(`SELECT * FROM ${table}`).all()).results,
        ),
      ).not.toContain(token);
  });
  it('is refused without the CSRF token, and for staff without the publish permission', async () => {
    const id = await interest();
    expect(
      (
        await post(
          `/admin/interest/${id}/approve`,
          await signIn('manager'),
          false,
        )
      ).status,
    ).toBe(403);
    for (const role of ['editor', 'viewer'])
      expect(
        (await post(`/admin/interest/${id}/approve`, await signIn(role)))
          .status,
        role,
      ).toBe(403);
    expect(
      (await db
        .prepare('SELECT decision FROM tailor_interest WHERE id = ?')
        .bind(id)
        .first<{ decision: string }>())!.decision,
    ).toBe('pending');
  });
  it('declines without creating anything, and lists the decision', async () => {
    const id = await interest();
    const cookie = await signIn('owner');
    const r = await post(`/admin/interest/${id}/decline`, cookie);
    expect(r.headers.get('location')).toContain('interest_declined');
    const html = await (await get('/admin/interest', cookie)).text();
    expect(html).toContain('Declined');
    expect(
      (await db
        .prepare(
          'SELECT count(*) AS c FROM tailor_account WHERE tailor_id IN (SELECT tailor_id FROM tailor_interest WHERE id = ?)',
        )
        .bind(id)
        .first<{ c: number }>())!.c,
    ).toBe(0);
  });
  it('offers Approve to managers and owners only, and a re-issue button on the tailor page', async () => {
    const id = await interest();
    expect(
      await (await get('/admin/interest', await signIn('manager'))).text(),
    ).toContain(`/admin/interest/${id}/approve`);
    const cookie = await signIn('owner');
    const r = await post(`/admin/interest/${id}/approve`, cookie);
    const tailorId = /\/admin\/tailors\/(\d+)"/.exec(await r.text())![1];
    const page = await (await get(`/admin/tailors/${tailorId}`, cookie)).text();
    expect(page).toContain('Invited, waiting for the tailor');
    const re = await post(`/admin/tailors/${tailorId}/invite`, cookie);
    expect(re.status).toBe(200);
    expect(await re.text()).toContain('/portal/accept?token=');
    expect(
      await (
        await get(`/admin/tailors/${tailorId}`, await signIn('editor'))
      ).text(),
    ).not.toContain('Make a new sign-in link');
  });
});
