export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../modules/config';
import { parseVariantKey } from '../../modules/media/keys';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * The only public image route. It reads the PUBLIC bucket only, and also asks D1 whether this image may be shown right now
 * (permission, visibility, tailor published), so a file left behind by a failed cleanup is never served (BR-06).
 */
export const GET: APIRoute = async ({ params }) => {
  const parsed = parseVariantKey(params.key ?? '');
  if (!parsed) return notFound();
  const { DB, MEDIA_PUBLIC } = requireBindings(env);

  const allowed = await DB.prepare(
    `SELECT 1 FROM portfolio_image i JOIN tailor t ON t.id = i.tailor_id
     WHERE i.tailor_id = ? AND i.file_key = ? AND i.permission_granted = 1 AND i.is_visible = 1 AND t.is_published = 1 AND t.permission_recorded = 1`,
  )
    .bind(parsed.tailorId, parsed.imageKey)
    .first();
  if (!allowed) return notFound();

  const object = await MEDIA_PUBLIC.get(params.key as string);
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(object.size),
      // One hour, not "forever": a withdrawn permission is gone from the bucket at once, but caches may keep a copy this long.
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
