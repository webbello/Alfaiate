import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  createProduct,
  getProduct,
  invalidFields,
  listProductCategories,
  listProducts,
  productFromForm,
  setPublished,
  updateProduct,
  type ProductInput,
} from '../../src/modules/shop/products';

// Shop S1 (docs/SPEC-shop.md, BR-13): products are drafts until someone with product.publish publishes them, and a published one keeps a description.
const db = env.DB;
let n = 0;
const actor = async (role = 'editor') =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(`p${++n}@example.test`, 'h', role)
      .run()
  ).meta.last_row_id as number;
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  name: `Fake Product ${++n}`,
  description: 'A made-up description.',
  price: '12.5',
  price_note: '',
  category_id: null,
  availability: 'available',
  ...over,
});
const make = async (over: Partial<ProductInput> = {}) => {
  const by = await actor();
  const r = await createProduct(db, by, 'editor', input(over));
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { id: r.id!, by };
};

describe('creating and editing', () => {
  it('stores a draft with a unique slug and the price in cents; nothing is public yet', async () => {
    const a = await make({ name: 'Fake Same Name', price: '12.5' });
    const b = await make({ name: 'Fake Same Name' });
    const [pa, pb] = [await getProduct(db, a.id), await getProduct(db, b.id)];
    expect(pa).toMatchObject({
      price_cents: 1250,
      is_published: 0,
      seller_tailor_id: null,
    });
    expect(pa!.slug).toBe('fake-same-name');
    expect(pb!.slug).toBe('fake-same-name-2');
  });

  it('refuses a bad name, price or note, a missing category, and an unknown role', async () => {
    const by = await actor();
    expect(invalidFields(input({ name: '' }))).toEqual(['name']);
    expect(invalidFields(input({ price: '12,5' }))).toEqual(['price']);
    expect(invalidFields(input({ price_note: 'x'.repeat(101) }))).toEqual([
      'price_note',
    ]);
    const gone = await createProduct(
      db,
      by,
      'editor',
      input({ category_id: 99999 }),
    );
    expect(gone).toMatchObject({
      ok: false,
      error: 'invalid',
      fields: ['category_id'],
    });
    expect(await createProduct(db, by, 'viewer', input())).toEqual({
      ok: false,
      error: 'forbidden',
    });
  });

  it('reads the form defensively', () => {
    const form = new FormData();
    form.set('name', '  Shirt ');
    form.set('category_id', 'abc');
    form.set('availability', 'weird');
    expect(productFromForm(form)).toMatchObject({
      name: 'Shirt',
      category_id: null,
      availability: 'available',
    });
  });

  it('updates a product and records who did it, with ids only', async () => {
    const { id, by } = await make();
    const r = await updateProduct(
      db,
      by,
      'editor',
      id,
      input({ name: 'Fake Renamed', price: '' }),
    );
    expect(r).toEqual({ ok: true });
    expect(await getProduct(db, id)).toMatchObject({
      name: 'Fake Renamed',
      price_cents: null,
    });
    const log = await db
      .prepare(
        "SELECT count(*) AS c FROM audit_log WHERE action = 'product_updated' AND entity_id = ?",
      )
      .bind(id)
      .first<{ c: number }>();
    expect(log!.c).toBe(1);
    expect(await updateProduct(db, by, 'viewer', id, input())).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await updateProduct(db, by, 'editor', 999999, input())).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('keeps two identical 100-character names apart without breaking the 60-character slug limit, and names a non-Latin product "product"', async () => {
    const long = 'Fake Long Name '.repeat(7).slice(0, 100);
    const a = await make({ name: long });
    const b = await make({ name: long });
    const [pa, pb] = [await getProduct(db, a.id), await getProduct(db, b.id)];
    expect(pa!.slug.length).toBeLessThanOrEqual(60);
    expect(pb!.slug.length).toBeLessThanOrEqual(60);
    expect(pb!.slug).not.toBe(pa!.slug);
    const odd = await make({ name: '日本語' });
    expect((await getProduct(db, odd.id))!.slug).toMatch(/^product(-\d+)?$/);
  });

  it('offers only the active product types, seeded by the migration', async () => {
    const names = (await listProductCategories(db)).map((c) => c.name);
    expect(names).toContain('Exclusive collection');
    expect(names).toContain('Fabrics');
  });
});

describe('publishing (BR-13)', () => {
  it('needs product.publish: an editor cannot, a manager can, and the page then shows as published', async () => {
    const { id, by } = await make();
    expect(await setPublished(db, by, 'editor', id, true)).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect((await getProduct(db, id))!.is_published).toBe(0);
    expect(await setPublished(db, by, 'manager', id, true)).toEqual({
      ok: true,
    });
    const row = await getProduct(db, id);
    expect(row!.is_published).toBe(1);
    expect(row!.published_at).not.toBeNull();
    expect(await setPublished(db, by, 'manager', id, false)).toEqual({
      ok: true,
    });
    expect((await getProduct(db, id))!.published_at).toBeNull();
  });

  it('refuses to publish without a description, and keeps a published product described', async () => {
    const bare = await make({ description: '' });
    expect(await setPublished(db, bare.by, 'owner', bare.id, true)).toEqual({
      ok: false,
      error: 'needs_description',
    });
    const live = await make();
    await setPublished(db, live.by, 'owner', live.id, true);
    expect(
      await updateProduct(
        db,
        live.by,
        'manager',
        live.id,
        input({ description: '' }),
      ),
    ).toEqual({
      ok: false,
      error: 'needs_description',
    });
  });

  it('is also backed by the database: a published row without a description cannot be stored', async () => {
    const { id } = await make({ description: '' });
    await expect(
      db
        .prepare('UPDATE product SET is_published = 1 WHERE id = ?')
        .bind(id)
        .run(),
    ).rejects.toThrow();
  });

  it('lets only product.publish edit a live product', async () => {
    const live = await make();
    await setPublished(db, live.by, 'manager', live.id, true);
    expect(
      await updateProduct(
        db,
        live.by,
        'editor',
        live.id,
        input({ name: 'Fake Changed By Editor' }),
      ),
    ).toEqual({ ok: false, error: 'forbidden' });
    expect(
      await updateProduct(
        db,
        live.by,
        'manager',
        live.id,
        input({ name: 'Fake Changed By Manager' }),
      ),
    ).toEqual({ ok: true });
  });

  it('lists published products first, then by name', async () => {
    const a = await make({ name: 'Zzz Fake Listed' });
    await setPublished(db, a.by, 'owner', a.id, true);
    const rows = await listProducts(db);
    expect(rows.findIndex((r) => r.id === a.id)).toBeLessThan(
      rows.findIndex((r) => r.is_published === 0),
    );
  });
});
