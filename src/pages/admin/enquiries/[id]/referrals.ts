export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { parseId, readForm } from '../../../../modules/http/body';
import { createReferral } from '../../../../modules/referral/create';

/** Pass an enquiry to an approved tailor (FR-REF-01/02). Records only; nothing is sent and no status changes. */
export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'referral.edit');
  if (auth instanceof Response) return auth;
  const form = (await readForm(context.request)).form;
  if (
    !(await verifyCsrf(
      context.cookies.get(SESSION_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  )
    return new Response('Forbidden', { status: 403 });

  const enquiryId = parseId(context.params.id);
  if (!Number.isInteger(enquiryId))
    return new Response('Not found', { status: 404 });
  const { DB } = requireBindings(env);
  if (
    !(await DB.prepare('SELECT 1 FROM enquiry WHERE id = ?')
      .bind(enquiryId)
      .first())
  )
    return new Response('Not found', { status: 404 });

  const result = await createReferral(DB, {
    enquiryId,
    tailorId: parseId(form.get('tailor_id')?.toString()),
    userId: auth.userId,
  });
  const code = result.ok
    ? 'referral_created'
    : result.error === 'not_found'
      ? 'invalid'
      : result.error;
  return context.redirect(
    `/admin/enquiries/${enquiryId}?msg=${code}#referrals`,
    303,
  );
};
