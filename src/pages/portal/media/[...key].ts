export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../modules/config';
import { parseProductKey, parseVariantKey } from '../../../modules/media/keys';
import { requireTailor } from '../../../modules/portal/require';

/** A tailor's preview of their own photos from the PRIVATE bucket. A key that belongs to another tailor is a plain 404. */
export const GET: APIRoute = async (context) => {
  const auth = await requireTailor(context);
  if (auth instanceof Response) return auth;
  const key = context.params.key ?? '';
  const parsed = parseVariantKey(key);
  const product = parseProductKey(key);
  const { DB, MEDIA_PRIVATE } = requireBindings(env);
  // A tailor's own photo, or a photo of one of their own products; anything else (another tailor's, the platform's) is a plain 404.
  const mine = product
    ? (await DB.prepare(
        'SELECT 1 AS ok FROM product_image i JOIN product p ON p.id = i.product_id WHERE i.product_id = ? AND i.file_key = ? AND p.seller_tailor_id = ?',
      )
        .bind(product.productId, product.imageKey, auth.tailorId)
        .first()) !== null
    : parsed !== null && parsed.tailorId === auth.tailorId;
  if (!mine) return new Response('Not found', { status: 404 });
  const object = await MEDIA_PRIVATE.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(object.size),
    },
  });
};
