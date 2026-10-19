import { env } from 'cloudflare:workers';
import { worker } from './worker';
import { hashPassword } from '../../src/modules/auth/password';

export const ORIGIN = 'https://example.test';
export const PASSWORD = 'a-long-fake-test-passphrase';
let n = 0;
export const unique = () => ++n;

export async function addUser(role: string) {
  const email = `h${unique()}@example.test`;
  await env.DB.prepare(
    'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
  )
    .bind(email, await hashPassword(PASSWORD, 1000), role)
    .run();
  return email;
}

export async function signIn(role: string): Promise<string> {
  const email = await addUser(role);
  const response = await worker.fetch(
    new Request(`${ORIGIN}/admin/login`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'cf-connecting-ip': `203.0.113.${unique() % 250}`,
      },
      body: new URLSearchParams({ email, password: PASSWORD }),
      redirect: 'manual',
    }),
  );
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

export const get = (path: string, cookie?: string) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      headers: cookie ? { Cookie: cookie } : {},
      redirect: 'manual',
    }),
  );

export const post = (
  path: string,
  cookie: string | undefined,
  form: Record<string, string> | FormData,
) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
      body: form instanceof FormData ? form : new URLSearchParams(form),
      redirect: 'manual',
    }),
  );

/** The csrf token the dashboard renders for this session. */
export async function csrfOf(cookie: string): Promise<string> {
  const html = await (await get('/admin', cookie)).text();
  return html.match(/name="csrf" value="([^"]+)"/)?.[1] ?? '';
}
