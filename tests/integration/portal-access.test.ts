import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, get, signIn, unique } from './helpers';
import { worker } from './worker';
import { approveInterest } from '../../src/modules/portal/approve';

// S2: accepting an invite, signing in, and keeping the two kinds of sign-in apart.
const db = env.DB;
const PASSWORD = 'a-long-fake-tailor-passphrase';
const setup = async () => {
  const ref = `JN-PX${String(unique()).padStart(6, '0')}`;
  await db
    .prepare(
      "INSERT INTO tailor_interest (reference_code, contact_name, business_name, phone_e164, consent_contact, consent_text_version, consent_at) VALUES (?, 'Portal Fake', 'Portal Atelier Fake', '+67077123456', 1, 'v', 'now')",
    )
    .bind(ref)
    .run();
  const id = (await db
    .prepare('SELECT id FROM tailor_interest WHERE reference_code = ?')
    .bind(ref)
    .first<{ id: number }>())!.id;
  const actor = (
    await db
      .prepare(
        "INSERT INTO admin_user (email, password_hash, role) VALUES (?, 'x', 'manager')",
      )
      .bind(`pa${unique()}@example.test`)
      .run()
  ).meta.last_row_id;
  const r = await approveInterest(db, { id, actorId: actor });
  if (!r.ok) throw new Error('setup');
  return r;
};
const form = (
  path: string,
  body: Record<string, string>,
  cookie?: string,
  ip = `198.51.100.${unique() % 250}`,
) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'cf-connecting-ip': ip,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: new URLSearchParams(body),
      redirect: 'manual',
    }),
  );
const cookieOf = (r: Response) =>
  r.headers.get('set-cookie')?.split(';')[0] ?? '';
const accept = (token: string, over: Record<string, string> = {}) =>
  form('/portal/accept', {
    token,
    email: `tailor${unique()}@example.test`,
    password: PASSWORD,
    consent: 'yes',
    ...over,
  });

describe('accepting an invite', () => {
  it('shows the form for a good link, and a plain message for a bad one', async () => {
    const r = await setup();
    const ok = await get(`/portal/accept?token=${r.token}`);
    expect(ok.status).toBe(200);
    const html = await ok.text();
    expect(html).toContain('name="consent"');
    expect(html).toContain('Nothing is shown to customers until');
    const bad = await get('/portal/accept?token=nope');
    expect(bad.status).toBe(410);
    expect(await bad.text()).toContain('This link cannot be used');
    expect((await get('/portal/accept')).status).toBe(410);
  });
  it('sets the password, records the consent, signs in, and the link then stops working', async () => {
    const r = await setup();
    const email = `accepted${unique()}@example.test`;
    const done = await accept(r.token, { email });
    expect(done.status).toBe(303);
    expect(done.headers.get('location')).toBe('/portal');
    expect(done.headers.get('set-cookie')).toContain('__Host-alfaiate_tailor=');
    expect(done.headers.get('cache-control')).toContain('no-store');
    const a = await db
      .prepare(
        'SELECT email, consent_version, consent_at, password_hash FROM tailor_account WHERE id = ?',
      )
      .bind(r.accountId)
      .first<{
        email: string;
        consent_version: string;
        consent_at: string;
        password_hash: string;
      }>();
    expect(a).toMatchObject({
      email,
      consent_version: 'consent-tailor-2026-10-v1',
    });
    expect(a!.password_hash).not.toContain(PASSWORD);
    expect((await accept(r.token)).status).toBe(410);
    const page = await get('/portal', cookieOf(done));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Portal Atelier Fake');
  });
  it('refuses a short password, a bad email, a missing consent tick and a taken email, keeping the link usable', async () => {
    const r = await setup();
    for (const [over, text, status] of [
      [{ password: 'short' }, 'at least 12 characters', 422],
      [{ email: 'not-an-email' }, 'valid email', 422],
      [{ consent: '' }, 'tick the box', 422],
    ] as const) {
      const res = await accept(r.token, over);
      expect(res.status, text).toBe(status);
      expect(await res.text()).toContain(text);
    }
    const other = await setup();
    const taken = `taken${unique()}@example.test`;
    await accept(other.token, { email: taken });
    const clash = await accept(r.token, { email: taken });
    expect(clash.status).toBe(422);
    expect(await clash.text()).toContain('already used');
    expect((await get(`/portal/accept?token=${r.token}`)).status).toBe(200);
    const activated = await db
      .prepare('SELECT email FROM tailor_account WHERE id = ?')
      .bind(r.accountId)
      .first<{ email: string | null }>();
    expect(activated!.email).toBeNull();
  });
});

describe('portal sign-in and sign-out', () => {
  const activated = async () => {
    const r = await setup();
    const email = `login${unique()}@example.test`;
    await accept(r.token, { email });
    return { ...r, email };
  };
  it('signs in with the password, refuses a wrong one the same way as an unknown address, and signs out', async () => {
    const a = await activated();
    const ok = await form('/portal/login', {
      email: a.email,
      password: PASSWORD,
    });
    expect(ok.status).toBe(303);
    const cookie = cookieOf(ok);
    const bad = await form('/portal/login', {
      email: a.email,
      password: 'wrong-password-123',
    });
    const unknown = await form('/portal/login', {
      email: 'nobody@example.test',
      password: 'wrong-password-123',
    });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    const plain = (html: string) => html.replace(/value="[^"]*"/g, '');
    expect(plain(await bad.text())).toBe(plain(await unknown.text()));
    const out = await form(
      '/portal/logout',
      { csrf: await csrfFor(cookie) },
      cookie,
    );
    expect(out.status).toBe(303);
    expect((await get('/portal', cookie)).status).toBe(302);
    const again = cookieOf(
      await form('/portal/login', { email: a.email, password: PASSWORD }),
    );
    expect((await form('/portal/logout', { csrf: 'bad' }, again)).status).toBe(
      403,
    );
    expect((await get('/portal', again)).status).toBe(200);
  });
  it('a deactivated tailor cannot sign in or keep using a session', async () => {
    const a = await activated();
    const cookie = cookieOf(
      await form('/portal/login', { email: a.email, password: PASSWORD }),
    );
    await db
      .prepare('UPDATE tailor_account SET is_active = 0 WHERE id = ?')
      .bind(a.accountId)
      .run();
    expect((await get('/portal', cookie)).status).toBe(302);
    expect(
      (await form('/portal/login', { email: a.email, password: PASSWORD }))
        .status,
    ).toBe(401);
  });
  it('limits repeated wrong passwords', async () => {
    const a = await activated();
    let last = 0;
    for (let i = 0; i < 8; i++)
      last = (
        await form(
          '/portal/login',
          { email: a.email, password: 'wrong-password-123' },
          undefined,
          '203.0.113.201',
        )
      ).status;
    expect(last).toBe(429);
  });
});

describe('the two sign-ins stay apart', () => {
  it('a tailor session does not open any admin page, and a staff session does not open the portal', async () => {
    const r = await setup();
    const tailorCookie = cookieOf(await accept(r.token));
    for (const path of [
      '/admin',
      '/admin/tailors',
      '/admin/enquiries',
      '/admin/interest',
      '/admin/users',
      '/admin/traffic',
    ]) {
      const res = await get(path, tailorCookie);
      expect(res.status, path).toBe(302);
      expect(res.headers.get('location'), path).toBe('/admin/login');
    }
    const staff = await signIn('owner');
    const res = await get('/portal', staff);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/portal/login');
  });
  it('portal pages are never cached or indexed', async () => {
    const r = await setup();
    const cookie = cookieOf(await accept(r.token));
    for (const path of ['/portal', '/portal/login', '/portal/accept']) {
      const res = await get(path, cookie);
      expect(res.headers.get('cache-control'), path).toContain('no-store');
      expect(res.headers.get('x-robots-tag'), path).toContain('noindex');
      expect(await res.text(), path).toContain(
        'name="robots" content="noindex,nofollow"',
      );
    }
  });
});

async function csrfFor(cookie: string) {
  const html = await (await get('/portal', cookie)).text();
  return html.match(/name="csrf" value="([^"]+)"/)?.[1] ?? '';
}
