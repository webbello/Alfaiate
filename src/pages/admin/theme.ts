export const prerender = false;
import { readForm } from '../../modules/http/body';
import type { APIRoute } from 'astro';
import { requirePermission } from '../../modules/auth/require';
import { verifyCsrf } from '../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../modules/auth/session';

// A display preference only: light or dark, kept in a plain cookie for a year. It carries no data about anyone.
export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'dashboard.view');
  if (auth instanceof Response) return auth;
  const form = (await readForm(context.request)).form;
  if (
    !(await verifyCsrf(
      context.cookies.get(SESSION_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  )
    return new Response('Forbidden', { status: 403 });
  const theme = form.get('theme')?.toString() === 'dark' ? 'dark' : 'light';
  context.cookies.set('admin_theme', theme, {
    path: '/admin',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: true,
    httpOnly: true,
  });
  // Back to the page the person was on, but only to a path inside the admin.
  const next = form.get('next')?.toString() ?? '';
  const safe = /^\/admin(?:[/?#][^\\\r\n]*)?$/.test(next) ? next : '/admin';
  return context.redirect(safe, 303);
};
