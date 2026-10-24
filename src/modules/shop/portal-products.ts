import { audit, who } from '../auth/audit';
import { hit } from '../auth/rate-limit';
import { VARIANTS, productVariantKey, type Variant } from '../media/keys';
import type { MediaBindings } from '../media/store';
import { tailorMayEdit } from '../portal/profile';
import type { TailorSession } from '../portal/session';
import { getTailor } from '../tailors/repo';
import {
  removeProductImage,
  storeProductImage,
  type ImageResult,
} from './images';
import {
  NOW,
  cents,
  categoryOk,
  getProduct,
  insertProduct,
  invalidFields,
  type ProductInput,
  type ProductRow,
  type Result,
} from './products';

/**
 * A tailor's own products (docs/SPEC-shop.md, S4, BR-13, BR-14). Everything here starts from the signed-in tailor's id (`session.tailorId`),
 * never from a URL or form, so one tailor can never read or change another's products. A tailor drafts and edits; staff publish. Once a product
 * is published the tailor can no longer change it: staff unpublish first. A photo is stored privately with the tailor's confirmation that it may be shown.
 */
export const MAX_OWN_PRODUCTS = 20;
export const PRODUCT_UPLOADS_PER_HOUR = 20;
type OwnFailure =
  'locked' | 'not_found' | 'limit' | 'not_confirmed' | 'limited';
export type OwnResult = Result | { ok: false; error: OwnFailure };

const actor = (session: TailorSession) => ({
  tailorAccountId: session.accountId,
});
/** The tailor's page may be edited (draft or approved), the same rule as the rest of the portal. */
async function gate(db: D1Database, session: TailorSession) {
  const tailor = await getTailor(db, session.tailorId);
  return tailor && tailorMayEdit(tailor.status) ? tailor : null;
}

export async function listOwnProducts(
  db: D1Database,
  tailorId: number,
): Promise<(ProductRow & { photos: number; cover_key: string | null })[]> {
  const { results } = await db
    .prepare(
      `SELECT p.*, (SELECT count(*) FROM product_image i WHERE i.product_id = p.id) AS photos,
              (SELECT file_key FROM product_image c WHERE c.product_id = p.id ORDER BY c.sort_order, c.id LIMIT 1) AS cover_key
       FROM product p WHERE p.seller_tailor_id = ? ORDER BY p.is_published DESC, p.name COLLATE NOCASE LIMIT 100`,
    )
    .bind(tailorId)
    .all<ProductRow & { photos: number; cover_key: string | null }>();
  return results;
}

/** One of this tailor's own products, or null (another tailor's product and the platform's are both null). */
export async function getOwnProduct(
  db: D1Database,
  tailorId: number,
  id: number,
): Promise<ProductRow | null> {
  const row = await getProduct(db, id);
  return row && row.seller_tailor_id === tailorId ? row : null;
}

export async function createOwnProduct(
  db: D1Database,
  session: TailorSession,
  input: ProductInput,
): Promise<OwnResult> {
  if (!(await gate(db, session))) return { ok: false, error: 'locked' };
  const count = (await db
    .prepare('SELECT count(*) AS c FROM product WHERE seller_tailor_id = ?')
    .bind(session.tailorId)
    .first<{ c: number }>())!.c;
  if (count >= MAX_OWN_PRODUCTS) return { ok: false, error: 'limit' };
  return insertProduct(db, actor(session), input, session.tailorId);
}

export async function updateOwnProduct(
  db: D1Database,
  session: TailorSession,
  id: number,
  input: ProductInput,
): Promise<OwnResult> {
  if (!(await gate(db, session))) return { ok: false, error: 'locked' };
  const current = await getOwnProduct(db, session.tailorId, id);
  if (!current) return { ok: false, error: 'not_found' };
  if (current.is_published) return { ok: false, error: 'locked' };
  const fields = invalidFields(input);
  if (fields.length > 0 || !(await categoryOk(db, input.category_id)))
    return {
      ok: false,
      error: 'invalid',
      fields: fields.length > 0 ? fields : ['category_id'],
    };
  await db
    .prepare(
      `UPDATE product SET name = ?, description = ?, price_cents = ?, price_note = ?, category_id = ?, availability = ?, details = ?, features = ?, returns = ?, updated_at = ${NOW} WHERE id = ? AND seller_tailor_id = ?`,
    )
    .bind(
      input.name,
      input.description || null,
      cents(input.price),
      input.price_note || null,
      input.category_id,
      input.availability,
      input.details || null,
      input.features || null,
      input.returns || null,
      id,
      session.tailorId,
    )
    .run();
  await audit(db, {
    ...who(actor(session)),
    action: 'product_updated',
    entityType: 'product',
    entityId: id,
  });
  return { ok: true };
}

export async function uploadOwnProductPhoto(
  b: MediaBindings,
  session: TailorSession,
  productId: number,
  input: {
    alt_text: string;
    confirmed: boolean;
    variants: Record<Variant, Uint8Array>;
  },
  now = new Date(),
): Promise<ImageResult | { ok: false; error: OwnFailure }> {
  if (!input.confirmed) return { ok: false, error: 'not_confirmed' };
  if (!(await gate(b.DB, session))) return { ok: false, error: 'locked' };
  const product = await getOwnProduct(b.DB, session.tailorId, productId);
  if (!product) return { ok: false, error: 'not_found' };
  if (product.is_published) return { ok: false, error: 'locked' };
  if (
    (await hit(b.DB, `portal:product-upload:${session.tailorId}`, 3600, now)) >
    PRODUCT_UPLOADS_PER_HOUR
  )
    return { ok: false, error: 'limited' };
  // Stored privately, with the day the tailor confirmed the photo may be shown (BR-14); it is public only when staff publish the product.
  return storeProductImage(
    b,
    actor(session),
    productId,
    // a tailor who writes nothing gets the product's name as the description, so no photo is stored without alt text
    { ...input, alt_text: input.alt_text.trim() || product.name.slice(0, 200) },
    now.toISOString().slice(0, 10),
  );
}

export async function removeOwnProductPhoto(
  b: MediaBindings,
  session: TailorSession,
  productId: number,
  imageId: number,
): Promise<ImageResult | { ok: false; error: OwnFailure }> {
  if (!(await gate(b.DB, session))) return { ok: false, error: 'locked' };
  const product = await getOwnProduct(b.DB, session.tailorId, productId);
  if (!product) return { ok: false, error: 'not_found' };
  if (product.is_published) return { ok: false, error: 'locked' };
  // 'manager' only passes the staff module's own role check; ownership and the draft rule were decided above.
  return removeProductImage(b, actor(session), 'manager', productId, imageId);
}

export { VARIANTS, productVariantKey };
