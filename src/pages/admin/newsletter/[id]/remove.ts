export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { parseId, readForm } from '../../../../modules/http/body';
import { removeSignup } from '../../../../modules/newsletter';

/** Owner only: deletes one address for good and writes an audit row with ids only. */
export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'enquiry.delete');
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
  const removed = await removeSignup(requireBindings(env).DB, id, auth.userId);
  return context.redirect(
    `/admin/newsletter?msg=${removed ? 'newsletter_removed' : 'not_found'}`,
    303,
  );
};
