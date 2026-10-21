export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { parseId, readForm } from '../../../../modules/http/body';
import { declineInterest } from '../../../../modules/portal/approve';

/** Nothing is sent to the applicant; the owner may contact them. */
export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'tailor.publish');
  if (auth instanceof Response) return auth;
  const form = (await readForm(context.request)).form;
  if (
    !(await verifyCsrf(
      context.cookies.get(SESSION_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  )
    return new Response('Forbidden', { status: 403 });
  const id = parseId(context.params.id);
  if (!Number.isInteger(id) || id < 1)
    return new Response('Not found', { status: 404 });
  const result = await declineInterest(requireBindings(env).DB, {
    id,
    actorId: auth.userId,
  });
  if (result === 'not_found') return new Response('Not found', { status: 404 });
  return context.redirect(
    `/admin/interest?msg=${result === 'ok' ? 'interest_declined' : 'interest_already_decided'}`,
    303,
  );
};
