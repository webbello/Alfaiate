export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import {
  approveTailor,
  publishTailor,
  recordPermission,
  setVerifiedFields,
  unpublishTailor,
  withdrawPermission,
  type PublishResult,
} from '../../../../modules/tailors/publish';
import { VERIFIABLE_FIELDS } from '../../../../modules/tailors/verification';
import { setImagePermission } from '../../../../modules/media/service';

export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'tailor.publish');
  if (auth instanceof Response) return auth;
  const form = await context.request.formData().catch(() => new FormData());
  if (
    !(await verifyCsrf(
      context.cookies.get(SESSION_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  ) {
    return new Response('Forbidden', { status: 403 });
  }

  const id = Number(context.params.id);
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 });
  const bindings = requireBindings(env);
  const field = (name: string) => form.get(name)?.toString() ?? '';
  const back = (query: string) =>
    context.redirect(`/admin/tailors/${id}?${query}`, 303);
  const answer = (r: PublishResult, success: string) => {
    if (r.ok) return back(`msg=${success}`);
    if (r.error === 'forbidden')
      return new Response('Forbidden', { status: 403 });
    if (r.error === 'not_found')
      return new Response('Not found', { status: 404 });
    if (r.error === 'blocked')
      return back(`msg=blocked&blockers=${r.blockers.join(',')}`);
    return back(`msg=${r.error}`);
  };

  switch (field('action')) {
    case 'approve':
      return answer(
        await approveTailor(bindings, auth.userId, auth.role, id),
        'saved',
      );
    case 'record_permission':
      return answer(
        await recordPermission(bindings, auth.userId, auth.role, id, {
          note: field('permission_note'),
          date: field('permission_date'),
          contact_publish_consent: field('contact_publish_consent') === 'on',
        }),
        'saved',
      );
    case 'withdraw_permission':
      return answer(
        await withdrawPermission(bindings, auth.userId, auth.role, id),
        'unpublished',
      );
    case 'set_verified':
      return answer(
        await setVerifiedFields(
          bindings,
          auth.userId,
          auth.role,
          id,
          VERIFIABLE_FIELDS.filter((f) => form.get(`verified_${f}`) === 'on'),
        ),
        'saved',
      );
    case 'image_permission': {
      const r = await setImagePermission(
        bindings,
        auth.userId,
        auth.role,
        id,
        Number(field('image_id')),
        {
          granted: field('granted') === '1',
          date: field('permission_date'),
        },
      );
      return r.ok
        ? back('msg=saved')
        : r.error === 'forbidden'
          ? new Response('Forbidden', { status: 403 })
          : back(`msg=${r.error}`);
    }
    case 'publish':
      return answer(
        await publishTailor(bindings, auth.userId, auth.role, id),
        'published',
      );
    case 'unpublish':
      return answer(
        await unpublishTailor(bindings, auth.userId, auth.role, id),
        'unpublished',
      );
    default:
      return back('msg=invalid');
  }
};
