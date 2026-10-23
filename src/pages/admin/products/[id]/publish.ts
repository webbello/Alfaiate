export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { parseId, readForm } from '../../../../modules/http/body';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { setPublished } from '../../../../modules/shop/products';

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
  const result = await setPublished(
    requireBindings(env).DB,
    auth.userId,
    auth.role,
    id,
    publish,
  );
  if (!result.ok && result.error === 'not_found')
    return new Response('Not found', { status: 404 });
  if (!result.ok && result.error === 'forbidden')
    return new Response('Forbidden', { status: 403 });
  return context.redirect(
    `/admin/products/${id}?msg=${result.ok ? (publish ? 'published' : 'unpublished') : result.error}`,
    303,
  );
};
