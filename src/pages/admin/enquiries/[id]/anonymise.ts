export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { parseId, readForm } from '../../../../modules/http/body';
import { anonymiseEnquiry } from '../../../../modules/enquiry/anonymise';

/** Owner-only, irreversible, and only with the reference code typed (PRV-04, FR-ADM-09). */
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
  const result = await anonymiseEnquiry(requireBindings(env).DB, {
    id,
    reference: form.get('confirm_reference')?.toString() ?? '',
    userId: auth.userId,
  });
  if (result === 'not_found') return new Response('Not found', { status: 404 });
  const code =
    result === 'ok'
      ? 'anonymised'
      : result === 'already'
        ? 'already_anonymised'
        : 'anonymise_wrong_reference';
  return context.redirect(`/admin/enquiries/${id}?msg=${code}`, 303);
};
