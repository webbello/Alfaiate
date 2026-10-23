export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../modules/config';
import { parseProductKey } from '../../../modules/media/keys';

const notFound = () => new Response('Not found', { status: 404 });

/** Product photos for the public shop. Reads the PUBLIC bucket only, and asks D1 whether the product is published right now, so a draft's photo is never served. */
export const GET: APIRoute = async ({ params }) => {
  const parsed = parseProductKey(params.key ?? '');
  if (!parsed) return notFound();
  const { DB, MEDIA_PUBLIC } = requireBindings(env);
  const allowed = await DB.prepare(
    'SELECT 1 FROM product_image i JOIN product p ON p.id = i.product_id WHERE i.product_id = ? AND i.file_key = ? AND p.is_published = 1',
  )
    .bind(parsed.productId, parsed.imageKey)
    .first();
  if (!allowed) return notFound();
  const object = await MEDIA_PUBLIC.get(params.key as string);
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(object.size),
      // One minute: an unpublished product's photo leaves caches quickly (BR-14).
      'Cache-Control': 'public, max-age=60',
    },
  });
};
