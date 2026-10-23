export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { parseId, readForm } from '../../../../modules/http/body';
import { requireTailor } from '../../../../modules/portal/require';
import { TAILOR_COOKIE } from '../../../../modules/portal/session';
import { removeOwnProductPhoto } from '../../../../modules/shop/portal-products';

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
  const id = parseId(context.params.id);
  const imageId = Number(form.get('image_id')?.toString() ?? '');
  if (!Number.isInteger(id) || !Number.isInteger(imageId))
    return new Response('Not found', { status: 404 });
  const result = await removeOwnProductPhoto(
    requireBindings(env),
    auth,
    id,
    imageId,
  );
  if (!result.ok && result.error === 'not_found')
    return new Response('Not found', { status: 404 });
  return context.redirect(
    `/portal/products/${id}?msg=${result.ok ? 'saved' : result.error === 'locked' ? 'locked' : 'invalid'}`,
    303,
  );
};
