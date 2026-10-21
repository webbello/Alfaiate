export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../modules/config';
import { verifyCsrf } from '../../../modules/auth/csrf';
import { readForm } from '../../../modules/http/body';
import {
  deletePortalPhoto,
  updatePortalPhoto,
} from '../../../modules/portal/photos';
import { requireTailor } from '../../../modules/portal/require';
import { TAILOR_COOKIE } from '../../../modules/portal/session';

export const POST: APIRoute = async (context) => {
  const auth = await requireTailor(context);
  if (auth instanceof Response) return auth;
  const form = (await readForm(context.request)).form;
  if (
    !(await verifyCsrf(
      context.cookies.get(TAILOR_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  )
    return new Response('Forbidden', { status: 403 });
  const field = (name: string) => form.get(name)?.toString() ?? '';
  const imageId = /^\d{1,9}$/.test(field('image_id'))
    ? Number(field('image_id'))
    : Number.NaN;
  const back = (code: string) =>
    context.redirect(`/portal/photos?msg=${code}`, 303);
  if (!Number.isInteger(imageId)) return back('invalid');
  const b = requireBindings(env);
  if (field('action') === 'details') {
    const r = await updatePortalPhoto(b, auth, imageId, {
      alt_text: field('alt_text'),
      caption: field('caption'),
    });
    return back(r.ok ? 'saved' : r.error === 'not_found' ? 'invalid' : r.error);
  }
  if (field('action') === 'delete') {
    const r = await deletePortalPhoto(b, auth, imageId);
    return back(
      r.ok ? 'removed' : r.error === 'not_found' ? 'invalid' : r.error,
    );
  }
  return back('invalid');
};
