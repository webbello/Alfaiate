export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { parseId, readForm } from '../../../../modules/http/body';
import { anonymiseInterest } from '../../../../modules/interest/anonymise';

/** Owner-only like the enquiry action, irreversible, and only with the reference code typed. */
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
  const result = await anonymiseInterest(requireBindings(env).DB, {
    id,
    reference: form.get('confirm_reference')?.toString() ?? '',
    userId: auth.userId,
  });
  if (result === 'not_found') return new Response('Not found', { status: 404 });
  const code =
    result === 'ok'
      ? 'interest_anonymised'
      : result === 'already'
        ? 'interest_already_anonymised'
        : 'interest_wrong_reference';
  return context.redirect(`/admin/interest?msg=${code}`, 303);
};
