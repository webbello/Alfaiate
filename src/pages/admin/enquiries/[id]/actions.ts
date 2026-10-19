export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { parseId, readForm } from '../../../../modules/http/body';
import { STATUSES, type Status } from '../../../../modules/enquiry/queries';
import {
  addEnquiryNote,
  setSpam,
  setStatus,
} from '../../../../modules/enquiry/status';

export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'enquiry.update');
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
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 });
  const { DB } = requireBindings(env);
  const back = (code: string) =>
    context.redirect(`/admin/enquiries/${id}?msg=${code}`, 303);
  const outcome = (result: string, saved: string) =>
    result === 'not_found'
      ? new Response('Not found', { status: 404 })
      : back(result === 'ok' || result === 'unchanged' ? saved : 'invalid');

  switch (form.get('action')?.toString()) {
    case 'set_status': {
      const status = STATUSES.find((s) => s === form.get('status')?.toString());
      if (!status) return back('invalid');
      return outcome(
        await setStatus(DB, {
          id,
          status: status as Status,
          userId: auth.userId,
        }),
        'status_saved',
      );
    }
    case 'add_note':
      return outcome(
        await addEnquiryNote(DB, {
          id,
          body: form.get('body')?.toString() ?? '',
          userId: auth.userId,
        }),
        'note_added',
      );
    case 'set_spam':
      return outcome(
        await setSpam(DB, {
          id,
          spam: form.get('spam')?.toString() === '1',
          userId: auth.userId,
        }),
        'spam_saved',
      );
    default:
      return back('invalid');
  }
};
