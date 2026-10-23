export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { parseId, readForm } from '../../../../../modules/http/body';
import { requireBindings } from '../../../../../modules/config';
import { requirePermission } from '../../../../../modules/auth/require';
import { verifyCsrf } from '../../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../../modules/auth/session';
import { removeProductImage } from '../../../../../modules/shop/images';

export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'product.edit');
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
  const imageId = Number(form.get('image_id')?.toString() ?? '');
  const back = (code: string) =>
    context.redirect(`/admin/products/${id}?msg=${code}`, 303);
  if (form.get('action')?.toString() !== 'delete' || !Number.isInteger(imageId))
    return back('invalid');
  const result = await removeProductImage(
    requireBindings(env),
    auth.userId,
    auth.role,
    id,
    imageId,
  );
  if (result.ok) return back('saved');
  if (result.error === 'forbidden')
    return new Response('Forbidden', { status: 403 });
  if (result.error === 'not_found')
    return new Response('Not found', { status: 404 });
  return back('invalid');
};
