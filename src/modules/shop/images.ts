import { audit, who, type Actor } from '../auth/audit';
import { can } from '../auth/permissions';
import {
  newImageKey,
  productImagePrefix,
  productVariantKey,
  VARIANTS,
  type Variant,
} from '../media/keys';
import { validateVariant, type ValidationError } from '../media/validate';
import type { MediaBindings } from '../media/store';

/**
 * Product photos (docs/SPEC-shop.md, S1b). Same safety as tailor photos: three JPEG variants made in the browser and validated again here,
 * written to the PRIVATE bucket under an unguessable key, copied to the PUBLIC bucket only while the product is published.
 */
export const MAX_PRODUCT_IMAGES = 6;
export type ProductImageRow = {
  id: number;
  file_key: string;
  alt_text: string;
  sort_order: number;
};
type Failure =
  | ValidationError
  | 'invalid'
  | 'missing_variant'
  | 'not_found'
  | 'forbidden'
  | 'limit'
  | 'storage';
export type ImageResult =
  { ok: true; id?: number } | { ok: false; error: Failure };

const productState = (db: D1Database, id: number) =>
  db
    .prepare('SELECT is_published FROM product WHERE id = ?')
    .bind(id)
    .first<{ is_published: number }>();

/** Editing a live product needs publish rights, as for its text (SEC-09). */
const mayChange = (role: string, live: boolean) =>
  can(role, 'product.edit') && (!live || can(role, 'product.publish'));

export async function listProductImages(
  db: D1Database,
  productId: number,
): Promise<ProductImageRow[]> {
  const { results } = await db
    .prepare(
      'SELECT id, file_key, alt_text, sort_order FROM product_image WHERE product_id = ? ORDER BY sort_order, id',
    )
    .bind(productId)
    .all<ProductImageRow>();
  return results;
}

export async function addProductImage(
  b: MediaBindings,
  actor: Actor,
  role: string,
  productId: number,
  input: { alt_text: string; variants: Record<Variant, Uint8Array> },
): Promise<ImageResult> {
  const alt = input.alt_text.trim();
  if (!alt || alt.length > 200) return { ok: false, error: 'invalid' };
  const state = await productState(b.DB, productId);
  if (!state) return { ok: false, error: 'not_found' };
  if (!mayChange(role, state.is_published === 1))
    return { ok: false, error: 'forbidden' };
  for (const variant of VARIANTS) {
    const bytes = input.variants?.[variant];
    if (!bytes) return { ok: false, error: 'missing_variant' };
    const checked = validateVariant(bytes, variant);
    if (!checked.ok) return checked;
  }
  const key = newImageKey();
  const written: string[] = [];
  const cleanUp = () =>
    Promise.allSettled(written.map((k) => b.MEDIA_PRIVATE.delete(k)));
  let id: number;
  try {
    for (const variant of VARIANTS) {
      const objectKey = productVariantKey(productId, key, variant);
      await b.MEDIA_PRIVATE.put(objectKey, input.variants[variant], {
        httpMetadata: { contentType: 'image/jpeg' },
      });
      written.push(objectKey);
    }
    // One statement checks the cap and inserts, so parallel uploads cannot pass the limit.
    const row = await b.DB.prepare(
      `INSERT INTO product_image (product_id, file_key, alt_text, sort_order)
       SELECT ?1, ?2, ?3, coalesce(max(sort_order), 0) + 1 FROM product_image WHERE product_id = ?1 HAVING count(*) < ?4`,
    )
      .bind(productId, key, alt, MAX_PRODUCT_IMAGES)
      .run();
    if (row.meta.changes === 0) {
      await cleanUp();
      return { ok: false, error: 'limit' };
    }
    id = row.meta.last_row_id;
  } catch {
    await cleanUp();
    return { ok: false, error: 'storage' };
  }
  await audit(b.DB, {
    ...who(actor),
    action: 'image_uploaded',
    entityType: 'product_image',
    entityId: id,
  });
  await syncProductImages(b, productId);
  return { ok: true, id };
}

export async function removeProductImage(
  b: MediaBindings,
  actor: Actor,
  role: string,
  productId: number,
  imageId: number,
): Promise<ImageResult> {
  const state = await productState(b.DB, productId);
  if (!state) return { ok: false, error: 'not_found' };
  if (!mayChange(role, state.is_published === 1))
    return { ok: false, error: 'forbidden' };
  const row = await b.DB.prepare(
    'SELECT file_key FROM product_image WHERE id = ? AND product_id = ?',
  )
    .bind(imageId, productId)
    .first<{ file_key: string }>();
  if (!row) return { ok: false, error: 'not_found' };
  const keys = VARIANTS.map((v) =>
    productVariantKey(productId, row.file_key, v),
  );
  // Files first, then the row: a failure leaves the row so the delete can be retried.
  await b.MEDIA_PRIVATE.delete(keys);
  await b.MEDIA_PUBLIC.delete(keys);
  await b.DB.prepare('DELETE FROM product_image WHERE id = ?')
    .bind(imageId)
    .run();
  await audit(b.DB, {
    ...who(actor),
    action: 'image_deleted',
    entityType: 'product_image',
    entityId: imageId,
  });
  return { ok: true };
}

/** Makes the public bucket hold exactly the photos of this product while it is published, none otherwise. Safe to run again after any failure. */
export async function syncProductImages(
  b: MediaBindings,
  productId: number,
): Promise<{ added: number; removed: number; missing: string[] }> {
  const state = await productState(b.DB, productId);
  const desired = new Set<string>();
  if (state?.is_published === 1)
    for (const image of await listProductImages(b.DB, productId))
      for (const v of VARIANTS)
        desired.add(productVariantKey(productId, image.file_key, v));
  const present = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await b.MEDIA_PUBLIC.list({
      prefix: productImagePrefix(productId),
      cursor,
    });
    for (const o of page.objects) present.add(o.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const extra = [...present].filter((k) => !desired.has(k));
  for (let i = 0; i < extra.length; i += 1000)
    await b.MEDIA_PUBLIC.delete(extra.slice(i, i + 1000));
  let added = 0;
  const missing: string[] = [];
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
  return { added, removed: extra.length, missing };
}
