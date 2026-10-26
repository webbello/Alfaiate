import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../config';
import { SESSION_COOKIE, type Session } from './session';
import { authorize } from './guard';

type Context = Pick<APIContext, 'cookies' | 'redirect'>;

/**
 * Every admin page and handler starts with this. Usage:
 *   const auth = await requirePermission(Astro, 'user.manage');
 *   if (auth instanceof Response) return auth;
 * Anonymous -> redirect to login; signed in without the permission -> 403.
 */
export async function requirePermission(
  ctx: Context,
  permission: string,
): Promise<Session | Response> {
  const result = await authorize(
    requireBindings(env).DB,
    ctx.cookies.get(SESSION_COOKIE)?.value,
    permission,
  );
  if (result.status === 'ok') {
    // a keep-me-signed-in session stays on the phone for 30 days from the last use: re-issue the cookie with the renewed date
    if (result.session.renewCookieUntil)
      ctx.cookies.set(SESSION_COOKIE, ctx.cookies.get(SESSION_COOKIE)!.value, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        expires: result.session.renewCookieUntil,
      });
    return result.session;
  }
  if (result.status === 'anonymous') return ctx.redirect('/admin/login', 302);
  return new Response('Forbidden', { status: 403 });
}
