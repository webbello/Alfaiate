import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn } from './helpers';
import { jpeg } from '../workers/fixtures/images';
import { productVariantKey } from '../../src/modules/media/keys';
import { syncProductImages } from '../../src/modules/shop/images';

// Shop S1b through the real routes: upload from the admin, private preview, and the public photo route that serves only a published product.
// a plain ArrayBuffer copy, which is what File accepts
const bytes = (width: number, height: number) =>
  jpeg({ width, height }).slice().buffer as ArrayBuffer;
const b = {
  DB: env.DB,
  MEDIA_PRIVATE: env.MEDIA_PRIVATE,
  MEDIA_PUBLIC: env.MEDIA_PUBLIC,
};
const idFrom = (location: string | null) =>
  Number(/\/admin\/products\/(\d+)/.exec(location ?? '')?.[1]);

async function newProduct(cookie: string, name: string) {
  const r = await post('/admin/products/new', cookie, {
    csrf: await csrfOf(cookie),
    name,
    description: 'A made-up description.',
  });
  return idFrom(r.headers.get('location'));
}
async function upload(cookie: string, id: number, alt = 'A fake photo') {
  const form = new FormData();
  form.set('csrf', await csrfOf(cookie));
  form.set('alt_text', alt);
  form.set(
    'thumb',
    new File([bytes(320, 240)], 'thumb.jpg', {
      type: 'image/jpeg',
    }),
  );
  form.set(
    'medium',
    new File([bytes(800, 600)], 'medium.jpg', {
      type: 'image/jpeg',
    }),
  );
  form.set(
    'large',
    new File([bytes(1600, 1200)], 'large.jpg', {
      type: 'image/jpeg',
    }),
  );
  return post(`/admin/products/${id}/images`, cookie, form);
}
const fileKeyOf = async (id: number) =>
  (await env.DB.prepare(
    'SELECT file_key FROM product_image WHERE product_id = ?',
  )
    .bind(id)
    .first<{ file_key: string }>())!.file_key;

describe('product photos in the admin', () => {
  it('uploads, lists with a private preview, and removes', async () => {
    const editor = await signIn('editor');
    const id = await newProduct(editor, 'Fake Photo Shirt');
    const r = await upload(editor, id);
    expect(r.headers.get('location')).toContain('msg=uploaded');
    const page = await (await get(`/admin/products/${id}`, editor)).text();
    const key = await fileKeyOf(id);
    expect(page).toContain(`/admin/media/product/${id}/${key}/thumb.jpg`);
    expect(page).toContain('alt="A fake photo"');
    const preview = await get(
      `/admin/media/product/${id}/${key}/thumb.jpg`,
      editor,
    );
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toBe('image/jpeg');
    expect(
      (await get(`/admin/media/product/${id}/${key}/thumb.jpg`)).status,
    ).toBe(302);
    expect(
      (
        await get(
          `/admin/media/product/${id}/${key}/thumb.jpg`,
          await signIn('viewer'),
        )
      ).status,
    ).toBe(403);
    const gone = await post(`/admin/products/${id}/images/actions`, editor, {
      csrf: await csrfOf(editor),
      action: 'delete',
      image_id: String(
        (await env.DB.prepare(
          'SELECT id FROM product_image WHERE product_id = ?',
        )
          .bind(id)
          .first<{ id: number }>())!.id,
      ),
    });
    expect(gone.headers.get('location')).toContain('msg=saved');
    expect(
      (await get(`/admin/media/product/${id}/${key}/thumb.jpg`, editor)).status,
    ).toBe(404);
  });

  it('refuses a missing variant, and a viewer', async () => {
    const editor = await signIn('editor');
    const id = await newProduct(editor, 'Fake Missing Variant');
    const form = new FormData();
    form.set('csrf', await csrfOf(editor));
    form.set('alt_text', 'x');
    expect(
      (await post(`/admin/products/${id}/images`, editor, form)).headers.get(
        'location',
      ),
    ).toContain('msg=missing_variant');
    expect((await upload(await signIn('viewer'), id)).status).toBe(403);
  });
});

describe('the public photo route', () => {
  it('serves a photo only while its product is published, and never a stray file from a draft', async () => {
    const manager = await signIn('manager');
    const id = await newProduct(manager, 'Fake Public Photo Item');
    await upload(manager, id);
    const key = await fileKeyOf(id);
    const url = `/media/shop/${productVariantKey(id, key, 'medium')}`;
    expect((await get(url)).status).toBe(404); // a draft
    // a stale copy left in the public bucket must still not be served while the product is a draft
    await env.MEDIA_PUBLIC.put(
      productVariantKey(id, key, 'medium'),
      jpeg({ width: 800, height: 600 }),
      { httpMetadata: { contentType: 'image/jpeg' } },
    );
    expect((await get(url)).status).toBe(404);
    await post(`/admin/products/${id}/publish`, manager, {
      csrf: await csrfOf(manager),
      action: 'publish',
    });
    const live = await get(url);
    expect(live.status).toBe(200);
    expect(live.headers.get('content-type')).toBe('image/jpeg');
    expect(live.headers.get('cache-control')).toContain('max-age=60');
    await post(`/admin/products/${id}/publish`, manager, {
      csrf: await csrfOf(manager),
      action: 'unpublish',
    });
    expect((await get(url)).status).toBe(404);
    expect(
      (await env.MEDIA_PUBLIC.list({ prefix: `product/${id}/` })).objects,
    ).toHaveLength(0);
    expect((await syncProductImages(b, id)).added).toBe(0);
  });

  it('answers 404 for anything that is not a strict product key, and has no listing', async () => {
    for (const path of [
      '/media/shop/',
      '/media/shop/product/1/x/thumb.jpg',
      '/media/shop/tailor/1/' + 'a'.repeat(32) + '/thumb.jpg',
      '/media/shop/product/1/' + 'a'.repeat(32) + '/thumb.png',
    ])
      expect((await get(path)).status, path).toBe(404);
  });
});
