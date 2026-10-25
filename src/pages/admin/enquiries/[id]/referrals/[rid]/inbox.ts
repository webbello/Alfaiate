export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../../../modules/config';
import { requirePermission } from '../../../../../../modules/auth/require';
import { verifyCsrf } from '../../../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../../../modules/auth/session';
import { parseId, readForm } from '../../../../../../modules/http/body';
import {
  sendToInbox,
  takeBackFromInbox,
} from '../../../../../../modules/referral/inbox';

/** Send one referral to the tailor's portal inbox, or take it back (FR-TPO-09). The same permission as the rest of a referral: `referral.edit`. */
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
  const args = { enquiryId, referralId, userId: auth.userId };
  const { DB } = requireBindings(env);
  const sending = form.get('action')?.toString() === 'send';
  if (!sending && form.get('action')?.toString() !== 'take_back')
    return new Response('Not found', { status: 404 });
  const result = sending
    ? await sendToInbox(DB, args)
    : await takeBackFromInbox(DB, args);
  if (result === 'not_found') return new Response('Not found', { status: 404 });
  const code =
    result === 'ok'
      ? sending
        ? 'inbox_sent'
        : 'inbox_taken_back'
      : result === 'unchanged'
        ? 'inbox_unchanged'
        : result === 'accepted'
          ? 'inbox_accepted'
          : 'inbox_closed';
  return context.redirect(
    `/admin/enquiries/${enquiryId}?msg=${code}#referral-${referralId}`,
    303,
  );
};
