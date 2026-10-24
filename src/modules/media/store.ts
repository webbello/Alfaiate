import { z } from 'zod';
import { audit, who, type Actor } from '../auth/audit';
import {
  imagePrefix,
  newImageKey,
  variantKey,
  VARIANTS,
  type Variant,
} from './keys';
import { validateVariant, type ValidationError } from './validate';

export const MAX_IMAGES = 10; // AD-07
export type MediaBindings = {
  DB: D1Database;
  MEDIA_PRIVATE: R2Bucket;
  MEDIA_PUBLIC: R2Bucket;
};

const meta = z.object({
  alt_text: z.string().trim().min(1).max(200),
  caption: z.string().trim().max(200).optional(),
});

export type StoreResult =
  | { ok: true; id: number }
  | {
      ok: false;
      error:
        | ValidationError
        | 'invalid'
        | 'missing_variant'
        | 'not_found'
        | 'limit'
        | 'storage';
    };

/**
 * Validates every variant, writes them to the PRIVATE bucket under a random key, then records metadata in D1.
 * New images are never public: permission and publication are separate steps (see reconcile.ts).
 */
export async function storeImage(
  b: MediaBindings,
  actorId: Actor,
  tailorId: number,
  input: {
    alt_text: string;
    caption?: string;
    variants: Record<Variant, Uint8Array>;
    /** Starting state, set in the same insert (the tailor portal stores photos hidden, with the tailor's confirmation). Default: visible, no permission. */
    initial?: { visible: boolean; permissionDate?: string };
  },
): Promise<StoreResult> {
  const parsed = meta.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  for (const variant of VARIANTS) {
    const bytes = input.variants?.[variant];
    if (!bytes) return { ok: false, error: 'missing_variant' };
    const checked = validateVariant(bytes, variant);
    if (!checked.ok) return checked;
  }
  if (
    !(await b.DB.prepare('SELECT 1 FROM tailor WHERE id = ?')
      .bind(tailorId)
      .first())
  )
    return { ok: false, error: 'not_found' };
  const count = (await b.DB.prepare(
    'SELECT count(*) AS c FROM portfolio_image WHERE tailor_id = ?',
  )
    .bind(tailorId)
    .first<{ c: number }>())!.c;
  if (count >= MAX_IMAGES) return { ok: false, error: 'limit' };

  const key = newImageKey();
  const written: string[] = [];
  const cleanUp = () =>
    Promise.allSettled(written.map((k) => b.MEDIA_PRIVATE.delete(k)));
  let imageId: number;
  try {
    for (const variant of VARIANTS) {
      const objectKey = variantKey(tailorId, key, variant);
      await b.MEDIA_PRIVATE.put(objectKey, input.variants[variant], {
        httpMetadata: { contentType: 'image/jpeg' },
      });
      written.push(objectKey);
    }
    // One statement checks the cap and inserts, so parallel uploads cannot slip past MAX_IMAGES (check-then-act race).
    const row = await b.DB.prepare(
      `INSERT INTO portfolio_image (tailor_id, file_key, alt_text, caption, sort_order, is_visible, permission_granted, permission_date)
       SELECT ?1, ?2, ?3, ?4, coalesce(max(sort_order), 0) + 1, ?6, ?7, ?8 FROM portfolio_image WHERE tailor_id = ?1 HAVING count(*) < ?5`,
    )
      .bind(
        tailorId,
        key,
        parsed.data.alt_text,
        parsed.data.caption || null,
        MAX_IMAGES,
        input.initial?.visible === false ? 0 : 1,
        input.initial?.permissionDate ? 1 : 0,
        input.initial?.permissionDate ?? null,
      )
      .run();
    if (row.meta.changes === 0) {
      await cleanUp();
      return { ok: false, error: 'limit' };
    }
    imageId = row.meta.last_row_id;
  } catch {
    await cleanUp();
    return { ok: false, error: 'storage' };
  }
  // Outside the try: the row and its files are consistent now, so a failing audit must not delete the files.
  await audit(b.DB, {
    ...who(actorId),
    action: 'image_uploaded',
    entityType: 'portfolio_image',
    entityId: imageId,
  });
  return { ok: true, id: imageId };
}

/** Files first, then the row: a failure leaves the row in place so the delete can be retried. */
export async function deleteImage(
  b: MediaBindings,
  actorId: Actor,
  tailorId: number,
  imageId: number,
): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const row = await b.DB.prepare(
    'SELECT file_key FROM portfolio_image WHERE id = ? AND tailor_id = ?',
  )
    .bind(imageId, tailorId)
    .first<{ file_key: string }>();
  if (!row) return { ok: false, error: 'not_found' };
  const keys = VARIANTS.map((variant) =>
    variantKey(tailorId, row.file_key, variant),
  );
  await b.MEDIA_PRIVATE.delete(keys);
  await b.MEDIA_PUBLIC.delete(keys);
  await b.DB.prepare('DELETE FROM portfolio_image WHERE id = ?')
    .bind(imageId)
    .run(); // the profile photo flag goes with the row
  await audit(b.DB, {
    ...who(actorId),
    action: 'image_deleted',
    entityType: 'portfolio_image',
    entityId: imageId,
  });
  return { ok: true };
}

export { imagePrefix };
