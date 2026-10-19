import { imagePrefix, variantKey, VARIANTS } from './keys';
import type { MediaBindings } from './store';

/**
 * Makes the public bucket hold exactly the images that may be public, recomputed from D1 every time:
 * permission granted AND visible AND the tailor is published (BR-06). Safe to run again after any failure.
 * The private bucket is never touched. Removals run first, so a failure cannot leave a withdrawn image public.
 */
export async function reconcileImages(
  b: MediaBindings,
  tailorId: number,
): Promise<{ added: number; removed: number; missing: string[] }> {
  const { results } = await b.DB.prepare(
    `SELECT i.id, i.file_key FROM portfolio_image i JOIN tailor t ON t.id = i.tailor_id
       WHERE i.tailor_id = ? AND i.permission_granted = 1 AND i.is_visible = 1 AND t.is_published = 1`,
  )
    .bind(tailorId)
    .all<{ id: number; file_key: string }>();
  const desired = new Set(
    results.flatMap((r) =>
      VARIANTS.map((v) => variantKey(tailorId, r.file_key, v)),
    ),
  );

  const present = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await b.MEDIA_PUBLIC.list({
      prefix: imagePrefix(tailorId),
      cursor,
    });
    for (const object of page.objects) present.add(object.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const extra = [...present].filter((k) => !desired.has(k));
  for (let i = 0; i < extra.length; i += 1000)
    await b.MEDIA_PUBLIC.delete(extra.slice(i, i + 1000));

  const missing: string[] = [];
  let added = 0;
  for (const key of desired) {
    if (present.has(key)) continue;
    const source = await b.MEDIA_PRIVATE.get(key);
    if (!source) {
      missing.push(key);
      continue;
    }
    await b.MEDIA_PUBLIC.put(key, await source.arrayBuffer(), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    added++;
  }

  const publicIds = results.map((r) => r.id);
  const marks = publicIds.map(() => '?').join(', ');
  await b.DB.prepare(
    `UPDATE tailor SET profile_photo_id = NULL WHERE id = ? AND profile_photo_id IS NOT NULL${publicIds.length ? ` AND profile_photo_id NOT IN (${marks})` : ''}`,
  )
    .bind(tailorId, ...publicIds)
    .run();
  return { added, removed: extra.length, missing };
}
