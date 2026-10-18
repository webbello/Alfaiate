export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../modules/config';
import { requirePermission } from '../../modules/auth/require';
import { verifyCsrf } from '../../modules/auth/csrf';
import { revokeSession, SESSION_COOKIE } from '../../modules/auth/session';
import { audit } from '../../modules/auth/audit';

export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'dashboard.view');
  if (auth instanceof Response) return auth;
  const token = context.cookies.get(SESSION_COOKIE)?.value ?? '';
  const form = await context.request.formData().catch(() => new FormData());
  if (!(await verifyCsrf(token, form.get('csrf')?.toString())))
    return new Response('Forbidden', { status: 403 });
  const { DB } = requireBindings(env);
  await revokeSession(DB, token);
  await audit(DB, { userId: auth.userId, action: 'logout' });
  // A __Host- cookie change is ignored by browsers unless it carries Secure.
  context.cookies.delete(SESSION_COOKIE, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
  });
  return context.redirect('/admin/login', 303);
};
