export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../modules/config';
import { parseVariantKey } from '../../../modules/media/keys';
import { requireTailor } from '../../../modules/portal/require';

/** A tailor's preview of their own photos from the PRIVATE bucket. A key that belongs to another tailor is a plain 404. */
export const GET: APIRoute = async (context) => {
  const auth = await requireTailor(context);
  if (auth instanceof Response) return auth;
  const key = context.params.key ?? '';
  const parsed = parseVariantKey(key);
  if (!parsed || parsed.tailorId !== auth.tailorId)
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
