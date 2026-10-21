export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../modules/config';
import { verifyCsrf } from '../../modules/auth/csrf';
import { readForm } from '../../modules/http/body';
import { requireTailor } from '../../modules/portal/require';
import {
  revokeTailorSession,
  TAILOR_COOKIE,
} from '../../modules/portal/session';

export const POST: APIRoute = async (context) => {
  const auth = await requireTailor(context);
  if (auth instanceof Response) return auth;
  const token = context.cookies.get(TAILOR_COOKIE)?.value ?? '';
  const form = (await readForm(context.request)).form;
  if (!(await verifyCsrf(token, form.get('csrf')?.toString())))
    return new Response('Forbidden', { status: 403 });
  await revokeTailorSession(requireBindings(env).DB, token);
  context.cookies.delete(TAILOR_COOKIE, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
  });
  return context.redirect('/portal/login', 303);
};
