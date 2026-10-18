import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { worker } from './worker';
import { ADMIN_ROUTES } from '../../src/modules/auth/admin-routes';
import { hashPassword } from '../../src/modules/auth/password';

const ORIGIN = 'https://example.test';
const PASSWORD = 'a-long-fake-test-passphrase';
let n = 0;

const addUser = async (role = 'owner') => {
  const email = `int${++n}@example.test`;
  await env.DB.prepare(
    'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
  )
    .bind(email, await hashPassword(PASSWORD, 1000), role)
    .run();
  return email;
};

type Options = {
  method?: string;
  cookie?: string;
  form?: Record<string, string>;
  ip?: string;
};
const send = (
  path: string,
  { method = 'GET', cookie, form, ip = `203.0.113.${++n}` }: Options = {},
) => {
  const headers: Record<string, string> = {
    'cf-connecting-ip': ip,
    Origin: ORIGIN,
  };
  if (cookie) headers.Cookie = cookie;
  const init: RequestInit = { method, headers, redirect: 'manual' };
  if (form) {
    init.body = new URLSearchParams(form);
  }
  return worker.fetch(new Request(`${ORIGIN}${path}`, init));
};

const signIn = async (role = 'owner') => {
  const email = await addUser(role);
  const response = await send('/admin/login', {
    method: 'POST',
    form: { email, password: PASSWORD },
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { email, cookie, response };
};

describe('anonymous access (AC-09)', () => {
  for (const route of ADMIN_ROUTES.filter((r) => r.permission !== null)) {
    for (const method of route.methods) {
      it(`${method} ${route.path} redirects to the login page`, async () => {
        const response = await send(route.path, {
          method,
          form: method === 'POST' ? { x: '1' } : undefined,
        });
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/admin/login');
        expect(response.headers.get('cache-control')).toBe('no-store');
      });
    }
  }

  it('shows the login page without a session', async () => {
    const response = await send('/admin/login');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await response.text()).toContain(
      'name="robots" content="noindex,nofollow"',
    );
  });
});

describe('sign in', () => {
  it('sets an HttpOnly, Secure, SameSite=Lax session cookie and redirects to the dashboard', async () => {
    const { response } = await signIn();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/admin');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^__Host-alfaiate_session=[A-Za-z0-9_-]{40,};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('shows the signed-in user and role on the dashboard, with no-store, noindex and a strict CSP', async () => {
    const { email, cookie } = await signIn('manager');
    const response = await send('/admin', { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('content-security-policy')).not.toContain(
      'unsafe-inline',
    );
    const html = await response.text();
    expect(html).toContain(email);
    expect(html).toContain('manager');
    expect(html).not.toContain('<style');
    expect(html).not.toMatch(/<script(?![^>]*src=)/);
  });

  it('gives the same generic error and no cookie for a wrong password and an unknown user', async () => {
    const email = await addUser();
    const wrong = await send('/admin/login', {
      method: 'POST',
      form: { email, password: 'nope-nope-nope' },
    });
    const unknown = await send('/admin/login', {
      method: 'POST',
      form: { email: 'ghost@example.test', password: 'nope-nope-nope' },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.headers.get('set-cookie')).toBeNull();
    expect(unknown.headers.get('set-cookie')).toBeNull();
    const [a, b] = [await wrong.text(), await unknown.text()];
    expect(a).toContain('Email or password is incorrect');
    expect(a.replace(email, 'X')).toBe(b.replace('ghost@example.test', 'X'));
  });

  it('keeps the email in the form after a failed attempt but never the password', async () => {
    const email = await addUser();
    const html = await (
      await send('/admin/login', {
        method: 'POST',
        form: { email, password: 'secret-attempt-123' },
      })
    ).text();
    expect(html).toContain(`value="${email}"`);
    expect(html).not.toContain('secret-attempt-123');
  });

  it('answers 429 after five failures from one address, even for the right password', async () => {
    const email = await addUser();
    const ip = '198.51.100.99';
    for (let i = 0; i < 5; i++)
      await send('/admin/login', {
        method: 'POST',
        form: { email, password: 'bad-bad-bad' },
        ip,
      });
    const blocked = await send('/admin/login', {
      method: 'POST',
      form: { email, password: PASSWORD },
      ip,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a malformed form without a server error', async () => {
    const response = await send('/admin/login', {
      method: 'POST',
      form: { email: '', password: '' },
    });
    expect(response.status).toBe(401);
  });
});

describe('sign out', () => {
  it('needs the csrf token: without it the request is refused and the session stays valid', async () => {
    const { cookie } = await signIn();
    const refused = await send('/admin/logout', {
      method: 'POST',
      cookie,
      form: { csrf: 'wrong' },
    });
    expect(refused.status).toBe(403);
    expect((await send('/admin', { cookie })).status).toBe(200);
  });

  it('with the csrf token ends the session and clears the cookie', async () => {
    const { cookie } = await signIn();
    const page = await (await send('/admin', { cookie })).text();
    const csrf = page.match(/name="csrf" value="([^"]+)"/)?.[1];
    expect(csrf).toBeTruthy();
    const out = await send('/admin/logout', {
      method: 'POST',
      cookie,
      form: { csrf: csrf! },
    });
    expect(out.status).toBe(303);
    expect(out.headers.get('location')).toBe('/admin/login');
    const cleared = out.headers.get('set-cookie') ?? '';
    expect(cleared).toContain('Secure'); // browsers ignore a __Host- cookie change without it
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toMatch(
      /__Host-alfaiate_session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i,
    );
    const after = await send('/admin', { cookie });
    expect(after.status).toBe(302);
  });

  it('refuses a cross-origin form post (Astro origin check)', async () => {
    const { cookie } = await signIn();
    const response = await worker.fetch(
      new Request(`${ORIGIN}/admin/logout`, {
        method: 'POST',
        headers: {
          Origin: 'https://evil.test',
          Cookie: cookie,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'csrf=x',
        redirect: 'manual',
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe('public pages are not affected', () => {
  it('serve cacheable, indexable headers with the security baseline', async () => {
    const response = await send('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBeNull();
    expect(response.headers.get('x-robots-tag')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
