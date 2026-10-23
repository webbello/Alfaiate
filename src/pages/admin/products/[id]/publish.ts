export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { parseId, readForm } from '../../../../modules/http/body';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { setPublished } from '../../../../modules/shop/products';
import { syncProductImages } from '../../../../modules/shop/images';

export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'product.publish');
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
  const publish = form.get('action')?.toString() === 'publish';
  const bindings = requireBindings(env);
  const result = await setPublished(
    bindings.DB,
    auth.userId,
    auth.role,
    id,
    publish,
  );
  // The public bucket follows the product: photos are copied in on publish and removed on unpublish.
  let synced = true;
  if (result.ok)
    try {
      await syncProductImages(bindings, id);
    } catch {
      // The change itself went through and the public route checks D1 on every request, so nothing leaks; saving again re-syncs.
      synced = false;
    }
  if (!result.ok && result.error === 'not_found')
    return new Response('Not found', { status: 404 });
  if (!result.ok && result.error === 'forbidden')
    return new Response('Forbidden', { status: 403 });
  return context.redirect(
    `/admin/products/${id}?msg=${result.ok ? (synced ? (publish ? 'published' : 'unpublished') : 'photos_sync') : result.error}`,
    303,
  );
};
