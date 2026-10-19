export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../../modules/config';
import { requirePermission } from '../../../../../modules/auth/require';
import { verifyCsrf } from '../../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../../modules/auth/session';
import {
  removePhoto,
  setOrder,
  setProfilePhoto,
  setVisibility,
  updateDetails,
  type Result,
} from '../../../../../modules/media/service';

export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'tailor.edit');
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
  const b = requireBindings(env);
  const field = (name: string) => form.get(name)?.toString() ?? '';
  const imageId = Number(field('image_id'));
  const back = (code: string) =>
    context.redirect(`/admin/tailors/${id}?msg=${code}`, 303);
  const answer = (r: Result) =>
    r.ok
      ? back('saved')
      : r.error === 'locked'
        ? new Response('Forbidden', { status: 403 })
        : back(r.error);
  if (!Number.isInteger(imageId)) return back('invalid');

  switch (field('action')) {
    case 'details':
      return answer(
        await updateDetails(b, auth.userId, auth.role, id, imageId, {
          alt_text: field('alt_text'),
          caption: field('caption'),
        }),
      );
    case 'order':
      return answer(
        field('sort_order') === ''
          ? { ok: false, error: 'invalid' }
          : await setOrder(
              b,
              auth.userId,
              auth.role,
              id,
              imageId,
              Number(field('sort_order')),
            ),
      );
    case 'visibility':
      return answer(
        await setVisibility(
          b,
          auth.userId,
          auth.role,
          id,
          imageId,
          field('visible') === '1',
        ),
      );
    case 'profile_photo':
      return answer(
        await setProfilePhoto(b, auth.userId, auth.role, id, imageId),
      );
    case 'delete':
      return answer(await removePhoto(b, auth.userId, auth.role, id, imageId));
    default:
      return back('invalid');
  }
};
