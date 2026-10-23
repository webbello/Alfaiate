import { audit, who, type Actor } from '../auth/audit';
import { can } from '../auth/permissions';
import { uniqueSlug } from '../db/unique-slug';
import { centsToDollars, dollarsToCents } from '../tailors/links';

/**
 * The shop's products (docs/SPEC-shop.md, S1). The platform's own items today; `seller_tailor_id` is reserved for tailors' products (S4).
 * Enquiry only: nothing here holds stock, takes payment or records an order.
 */
export type ProductRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  price_note: string | null;
  category_id: number | null;
  seller_tailor_id: number | null;
  availability: 'available' | 'unavailable';
  is_published: number;
  published_at: string | null;
};
export type ProductCategory = {
  id: number;
  slug: string;
  name: string;
  is_active: number;
};
export type ProductInput = {
  name: string;
  description: string;
  price: string;
  price_note: string;
  category_id: number | null;
  availability: 'available' | 'unavailable';
};
export type Failure =
  'forbidden' | 'not_found' | 'invalid' | 'needs_description';
export type Result =
  { ok: true; id?: number } | { ok: false; error: Failure; fields?: string[] };

const LIMITS = { name: 100, description: 2000, price_note: 100 };

/** Reads the admin form. Anything odd becomes an empty or default value that the checks below then refuse. */
export function productFromForm(form: FormData): ProductInput {
  const text = (k: string) => (form.get(k)?.toString() ?? '').trim();
  const cat = Number(text('category_id'));
  return {
    name: text('name'),
    description: text('description'),
    price: text('price'),
    price_note: text('price_note'),
    category_id: Number.isInteger(cat) && cat > 0 ? cat : null,
    availability:
      text('availability') === 'unavailable' ? 'unavailable' : 'available',
  };
}

/** The fields that fail, by form name. An empty list means the input is acceptable. */
export function invalidFields(input: ProductInput): string[] {
  const bad: string[] = [];
  if (!input.name || input.name.length > LIMITS.name) bad.push('name');
  if (input.description.length > LIMITS.description) bad.push('description');
  if (input.price_note.length > LIMITS.price_note) bad.push('price_note');
  try {
    dollarsToCents(input.price);
  } catch {
    bad.push('price');
  }
  return bad;
}

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
const cents = (price: string) => dollarsToCents(price);

async function categoryOk(db: D1Database, id: number | null): Promise<boolean> {
  if (id === null) return true;
  return (
    (await db
      .prepare(
        'SELECT 1 AS ok FROM product_category WHERE id = ? AND is_active = 1',
      )
      .bind(id)
      .first()) !== null
  );
}

export async function createProduct(
  db: D1Database,
  actor: Actor,
  role: string,
  input: ProductInput,
): Promise<Result> {
  if (!can(role, 'product.edit')) return { ok: false, error: 'forbidden' };
  const fields = invalidFields(input);
  if (fields.length > 0 || !(await categoryOk(db, input.category_id)))
    return {
      ok: false,
      error: 'invalid',
      fields: fields.length > 0 ? fields : ['category_id'],
    };
  const slug = await uniqueSlug(db, 'product', input.name);
  const created = await db
    .prepare(
      'INSERT INTO product (slug, name, description, price_cents, price_note, category_id, availability) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      slug,
      input.name,
      input.description || null,
      cents(input.price),
      input.price_note || null,
      input.category_id,
      input.availability,
    )
    .run();
  const id = created.meta.last_row_id as number;
  await audit(db, {
    ...who(actor),
    action: 'product_created',
    entityType: 'product',
    entityId: id,
  });
  return { ok: true, id };
}

export async function updateProduct(
  db: D1Database,
  actor: Actor,
  role: string,
  id: number,
  input: ProductInput,
): Promise<Result> {
  if (!can(role, 'product.edit')) return { ok: false, error: 'forbidden' };
  const fields = invalidFields(input);
  if (fields.length > 0 || !(await categoryOk(db, input.category_id)))
    return {
      ok: false,
      error: 'invalid',
      fields: fields.length > 0 ? fields : ['category_id'],
    };
  const current = await getProduct(db, id);
  if (!current) return { ok: false, error: 'not_found' };
  // Editing a live product needs publish rights too, so an editor cannot change public text around the publish control (SEC-09). An editor unpublishes by asking a manager.
  if (current.is_published && !can(role, 'product.publish'))
    return { ok: false, error: 'forbidden' };
  // A published product must keep its description: take the page down first to remove it.
  if (current.is_published && !input.description)
    return { ok: false, error: 'needs_description' };
  await db
    .prepare(
      `UPDATE product SET name = ?, description = ?, price_cents = ?, price_note = ?, category_id = ?, availability = ?, updated_at = ${NOW} WHERE id = ?`,
    )
    .bind(
      input.name,
      input.description || null,
      cents(input.price),
      input.price_note || null,
      input.category_id,
      input.availability,
      id,
    )
    .run();
  await audit(db, {
    ...who(actor),
    action: 'product_updated',
    entityType: 'product',
    entityId: id,
  });
  return { ok: true };
}

/** Publishing needs `product.publish` and a description (the database backs the same rule with a CHECK). */
export async function setPublished(
  db: D1Database,
  actor: Actor,
  role: string,
  id: number,
  publish: boolean,
): Promise<Result> {
  if (!can(role, 'product.publish')) return { ok: false, error: 'forbidden' };
  const current = await getProduct(db, id);
  if (!current) return { ok: false, error: 'not_found' };
  if (publish && !(current.description ?? '').trim())
    return { ok: false, error: 'needs_description' };
  await db
    .prepare(
      `UPDATE product SET is_published = ?, published_at = ${publish ? NOW : 'NULL'}, updated_at = ${NOW} WHERE id = ?`,
    )
    .bind(publish ? 1 : 0, id)
    .run();
  await audit(db, {
    ...who(actor),
    action: publish ? 'product_published' : 'product_unpublished',
    entityType: 'product',
    entityId: id,
  });
  return { ok: true };
}

export async function getProduct(
  db: D1Database,
  id: number,
): Promise<ProductRow | null> {
  return db
    .prepare('SELECT * FROM product WHERE id = ?')
    .bind(id)
    .first<ProductRow>();
}

export async function listProducts(
  db: D1Database,
): Promise<(ProductRow & { category_name: string | null })[]> {
  const { results } = await db
    .prepare(
      `SELECT p.*, c.name AS category_name FROM product p LEFT JOIN product_category c ON c.id = p.category_id
       ORDER BY p.is_published DESC, p.name COLLATE NOCASE LIMIT 500`,
    )
    .all<ProductRow & { category_name: string | null }>();
  return results;
}

export async function listProductCategories(
  db: D1Database,
): Promise<ProductCategory[]> {
  const { results } = await db
    .prepare(
      'SELECT id, slug, name, is_active FROM product_category WHERE is_active = 1 ORDER BY sort_order, name',
    )
    .all<ProductCategory>();
  return results;
}

export const priceInput = (row: Pick<ProductRow, 'price_cents'>) =>
  centsToDollars(row.price_cents);
