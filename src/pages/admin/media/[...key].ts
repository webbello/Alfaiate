export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../modules/config';
import { requirePermission } from '../../../modules/auth/require';
import { parseProductKey, parseVariantKey } from '../../../modules/media/keys';

/** Preview of any uploaded photo, including ones that are not public, from the PRIVATE bucket. Editors and above. */
export const GET: APIRoute = async (context) => {
  const key = context.params.key ?? '';
  // Product photos are previewed with product.edit, tailor photos with tailor.edit; each key shape is checked strictly first.
  const auth = await requirePermission(
    context,
    parseProductKey(key) ? 'product.edit' : 'tailor.edit',
  );
  if (auth instanceof Response) return auth;
  if (!parseVariantKey(key) && !parseProductKey(key))
    return new Response('Not found', { status: 404 });
  const object = await requireBindings(env).MEDIA_PRIVATE.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(object.size),
    },
  });
};
