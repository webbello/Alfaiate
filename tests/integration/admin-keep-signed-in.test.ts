import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, PASSWORD, csrfOf, get, post, unique } from './helpers';
import { worker } from './worker';
import { hashPassword } from '../../src/modules/auth/password';

// FR-ADM-18: a tick on the sign-in page keeps a phone signed in for 30 days; without it the old limits stand; "Sign out everywhere" ends every sign-in.
const DAY = 24 * 60 * 60_000;
async function user() {
  const email = `keep${unique()}@example.test`;
  const id = (
    await env.DB.prepare(
      "INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, 'owner')",
    )
      .bind(email, await hashPassword(PASSWORD, 1000))
      .run()
  ).meta.last_row_id;
  return { email, id };
}
const signIn = (email: string, extra: Record<string, string> = {}) =>
  worker.fetch(
    new Request(`${ORIGIN}/admin/login`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'cf-connecting-ip': `203.0.113.${unique() % 250}`,
      },
      body: new URLSearchParams({ email, password: PASSWORD, ...extra }),
      redirect: 'manual',
    }),
  );
const cookieOf = (r: Response) =>
  r.headers.get('set-cookie')?.split(';')[0] ?? '';
const expiresIn = (r: Response) => {
  const m = /expires=([^;]+)/i.exec(r.headers.get('set-cookie') ?? '');
  return m ? new Date(m[1]!).getTime() - Date.now() : NaN;
};

describe('keep me signed in', () => {
  it('shows the tick on the sign-in page', async () => {
    const html = await (await get('/admin/login')).text();
    expect(html).toMatch(
      /<input id="keep" name="keep" type="checkbox" value="yes"/,
    );
    expect(html).toContain('Keep me signed in on this device (30 days)');
  });

  it('gives a 30-day cookie when ticked and a 12-hour one when not', async () => {
    const u = await user();
    const kept = await signIn(u.email, { keep: 'yes' });
    expect(kept.status).toBe(303);
    expect(expiresIn(kept)).toBeGreaterThan(29 * DAY);
    expect(expiresIn(kept)).toBeLessThan(31 * DAY);
    const plain = await signIn(u.email);
    expect(expiresIn(plain)).toBeGreaterThan(11 * 60 * 60_000);
    expect(expiresIn(plain)).toBeLessThan(13 * 60 * 60_000);
    const rows = await env.DB.prepare(
      'SELECT keep_signed_in AS k FROM admin_session WHERE admin_user_id = ? ORDER BY id',
    )
      .bind(u.id)
      .all<{ k: number }>();
    expect(rows.results.map((r) => r.k)).toEqual([1, 0]);
    expect((await get('/admin', cookieOf(kept))).status).toBe(200);
  });

  it('Sign out everywhere ends every sign-in of that person, including this one, and is audited', async () => {
    const u = await user();
    const phone = cookieOf(await signIn(u.email, { keep: 'yes' }));
    const laptop = cookieOf(await signIn(u.email));
    const page = await (await get('/admin/account', laptop)).text();
    expect(page).toContain('Sign out everywhere');
    const done = await post('/admin/account', laptop, {
      csrf: await csrfOf(laptop),
      action: 'signout_all',
    });
    expect(done.status).toBe(303);
    expect(done.headers.get('location')).toBe('/admin/login');
    expect((await get('/admin', laptop)).status).toBe(302);
    expect((await get('/admin', phone)).status).toBe(302);
    const left = await env.DB.prepare(
      'SELECT count(*) AS c FROM admin_session WHERE admin_user_id = ?',
    )
      .bind(u.id)
      .first<{ c: number }>();
    expect(left!.c).toBe(0);
    const logged = await env.DB.prepare(
      "SELECT count(*) AS c FROM audit_log WHERE action = 'signed_out_everywhere' AND admin_user_id = ?",
    )
      .bind(u.id)
      .first<{ c: number }>();
    expect(logged!.c).toBe(1);
  });
});
