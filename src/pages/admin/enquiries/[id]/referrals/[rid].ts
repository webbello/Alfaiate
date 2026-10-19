export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../../modules/config';
import { requirePermission } from '../../../../../modules/auth/require';
import { verifyCsrf } from '../../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../../modules/auth/session';
import { parseId, readForm } from '../../../../../modules/http/body';
import { updateReferral } from '../../../../../modules/referral/update';

/** Forwarding, tailor response and reported completion (FR-REF-03/04/05). Fee fields are not read here. */
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
  const referralId = parseId(context.params.rid);
  if (!Number.isInteger(enquiryId) || !Number.isInteger(referralId))
    return new Response('Not found', { status: 404 });

  const KEYS = [
    'forwarded_at',
    'forwarded_via',
    'fields_shared_note',
    'tailor_response',
    'responded_at',
    'completion_reported_at',
    'completion_reported_by',
    'closed_reason',
  ];
  const result = await updateReferral(requireBindings(env).DB, {
    enquiryId,
    referralId,
    userId: auth.userId,
    role: auth.role,
    input: Object.fromEntries(
      KEYS.map((key) => [key, form.get(key)?.toString() ?? '']),
    ),
  });
  if (!result.ok && result.error === 'not_found')
    return new Response('Not found', { status: 404 });
  return context.redirect(
    `/admin/enquiries/${enquiryId}?msg=${result.ok ? 'referral_saved' : result.error}#referrals`,
    303,
  );
};
