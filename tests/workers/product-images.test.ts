import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  parseProductKey,
  parseVariantKey,
  productImagePrefix,
  productVariantKey,
} from '../../src/modules/media/keys';
import {
  addProductImage,
  listProductImages,
  MAX_PRODUCT_IMAGES,
  removeProductImage,
  syncProductImages,
} from '../../src/modules/shop/images';
import { createProduct, setPublished } from '../../src/modules/shop/products';
import { jpeg } from './fixtures/images';

// Shop S1b: product photos are private while the product is a draft, copied to the public bucket only while it is published (BR-13).
const b = {
  DB: env.DB,
  MEDIA_PRIVATE: env.MEDIA_PRIVATE,
  MEDIA_PUBLIC: env.MEDIA_PUBLIC,
};
let n = 0;
const actor = async () =>
  (
    await env.DB.prepare(
      'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
    )
      .bind(`pi${++n}@example.test`, 'h', 'manager')
      .run()
  ).meta.last_row_id as number;
const product = async () => {
  const by = await actor();
  const r = await createProduct(env.DB, by, 'editor', {
    name: `Fake Photo Product ${++n}`,
    description: 'A made-up description.',
    price: '',
    price_note: '',
    category_id: null,
    availability: 'available',
  });
  if (!r.ok) throw new Error('setup');
  return { id: r.id!, by };
};
const good = () => ({
  thumb: jpeg({ width: 320, height: 240 }),
  medium: jpeg({ width: 800, height: 600 }),
  large: jpeg({ width: 1600, height: 1200 }),
});
const keys = async (bucket: R2Bucket, id: number) =>
  (await bucket.list({ prefix: productImagePrefix(id) })).objects
    .map((o) => o.key)
    .sort();

describe('product photo keys', () => {
  it('parse strictly, and never mix with tailor keys', () => {
    const key = productVariantKey(7, 'a'.repeat(32), 'thumb');
    expect(key).toBe(`product/7/${'a'.repeat(32)}/thumb.jpg`);
    expect(parseProductKey(key)).toEqual({
      productId: 7,
      imageKey: 'a'.repeat(32),
      variant: 'thumb',
    });
    expect(parseVariantKey(key)).toBeNull();
    expect(parseProductKey(`tailor/7/${'a'.repeat(32)}/thumb.jpg`)).toBeNull();
    for (const bad of [
      'product/7/../x/thumb.jpg',
      `product/7/${'A'.repeat(32)}/thumb.jpg`,
      `product/7/${'a'.repeat(32)}/thumb.png`,
      `/product/7/${'a'.repeat(32)}/thumb.jpg`,
    ])
      expect(parseProductKey(bad), bad).toBeNull();
  });
});

describe('product photos', () => {
  it('go to the private bucket only while the product is a draft', async () => {
    const { id, by } = await product();
    const r = await addProductImage(b, by, 'editor', id, {
      alt_text: 'A fake shirt',
      variants: good(),
    });
    expect(r.ok).toBe(true);
    expect((await keys(env.MEDIA_PRIVATE, id)).length).toBe(3);
    expect(await keys(env.MEDIA_PUBLIC, id)).toEqual([]);
    expect(
      (await listProductImages(env.DB, id)).map((i) => i.alt_text),
    ).toEqual(['A fake shirt']);
  });

  it('are copied to the public bucket when the product is published, and taken out again when it is unpublished', async () => {
    const { id, by } = await product();
    await addProductImage(b, by, 'editor', id, {
      alt_text: 'Fake',
      variants: good(),
    });
    await setPublished(env.DB, by, 'manager', id, true);
    expect(await syncProductImages(b, id)).toMatchObject({
      added: 3,
      removed: 0,
      missing: [],
    });
    expect((await keys(env.MEDIA_PUBLIC, id)).length).toBe(3);
    await setPublished(env.DB, by, 'manager', id, false);
    expect(await syncProductImages(b, id)).toMatchObject({
      added: 0,
      removed: 3,
    });
    expect(await keys(env.MEDIA_PUBLIC, id)).toEqual([]);
    expect((await keys(env.MEDIA_PRIVATE, id)).length).toBe(3);
  });

  it('refuse a bad image, a missing variant, an empty description and an unknown product; nothing is stored', async () => {
    const { id, by } = await product();
    const bad = { ...good(), medium: new Uint8Array([1, 2, 3]) };
    expect(
      (
        await addProductImage(b, by, 'editor', id, {
          alt_text: 'x',
          variants: bad,
        })
      ).ok,
    ).toBe(false);
    expect(
      await addProductImage(b, by, 'editor', id, {
        alt_text: '  ',
        variants: good(),
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await addProductImage(b, by, 'editor', 99999999, {
        alt_text: 'x',
        variants: good(),
      }),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(
      await addProductImage(b, by, 'viewer', id, {
        alt_text: 'x',
        variants: good(),
      }),
    ).toEqual({ ok: false, error: 'forbidden' });
    expect(await keys(env.MEDIA_PRIVATE, id)).toEqual([]);
    expect(await listProductImages(env.DB, id)).toEqual([]);
  });

  it('are capped, and the cap holds for parallel uploads', async () => {
    const { id, by } = await product();
    const results = await Promise.all(
      Array.from({ length: MAX_PRODUCT_IMAGES + 3 }, (_, i) =>
        addProductImage(b, by, 'editor', id, {
          alt_text: `Fake ${i}`,
          variants: good(),
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_PRODUCT_IMAGES);
    expect(
      results.filter((r) => !r.ok).every((r) => !r.ok && r.error === 'limit'),
    ).toBe(true);
    expect((await keys(env.MEDIA_PRIVATE, id)).length).toBe(
      MAX_PRODUCT_IMAGES * 3,
    );
  });

  it('need product.publish to change once the product is live', async () => {
    const { id, by } = await product();
    await setPublished(env.DB, by, 'manager', id, true);
    expect(
      await addProductImage(b, by, 'editor', id, {
        alt_text: 'x',
        variants: good(),
      }),
    ).toEqual({ ok: false, error: 'forbidden' });
    const added = await addProductImage(b, by, 'manager', id, {
      alt_text: 'Fake live',
      variants: good(),
    });
    expect(added.ok).toBe(true);
    expect((await keys(env.MEDIA_PUBLIC, id)).length).toBe(3); // a photo added to a live product is public at once
    const imageId = (await listProductImages(env.DB, id))[0]!.id;
    expect(await removeProductImage(b, by, 'editor', id, imageId)).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await removeProductImage(b, by, 'manager', id, imageId)).toEqual({
      ok: true,
    });
    expect(await keys(env.MEDIA_PUBLIC, id)).toEqual([]);
    expect(await keys(env.MEDIA_PRIVATE, id)).toEqual([]);
  });

  it("are removed from both buckets and from the list, and one product cannot remove another one's photo", async () => {
    const [a, other] = [await product(), await product()];
    await addProductImage(b, a.by, 'editor', a.id, {
      alt_text: 'Fake',
      variants: good(),
    });
    const imageId = (await listProductImages(env.DB, a.id))[0]!.id;
    expect(
      await removeProductImage(b, other.by, 'editor', other.id, imageId),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(await removeProductImage(b, a.by, 'editor', a.id, imageId)).toEqual({
      ok: true,
    });
    expect(await keys(env.MEDIA_PRIVATE, a.id)).toEqual([]);
    expect(await listProductImages(env.DB, a.id)).toEqual([]);
  });
});
