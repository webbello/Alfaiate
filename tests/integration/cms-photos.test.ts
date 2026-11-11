import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn } from './helpers';

// FR-CMS-04, 08: photos kept in the content editor are matched to a tailor or product by slug; the content entries `example-tailor` and `example-product` exist for these tests.
const run = (sql: string, ...args: (string | number | null)[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();

let tailorId = 0;
let productId = 0;

describe('tailor photos from the content editor', () => {
  it('shows them on the card and the profile when the tailor has no photo of their own, as plain files', async () => {
    tailorId = (
      await run(
        "INSERT INTO tailor (slug, display_name, description, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES ('example-tailor', 'Cms Fake Tailor', 'A short made-up description.', 'approved', 1, 1, 1, '+67033123456')",
      )
    ).meta.last_row_id as number;
    const profile = await (await get('/tailors/example-tailor')).text();
    expect(profile).toContain('src="/photos/tailors/example-tailor.webp"');
    expect(profile).toContain('/photos/tailors/example-tailor-2.webp');
    expect(profile).toContain(
      'alt="Example photo: a tape measure, thread and scissors"',
    );
    expect(profile).not.toContain('/media/tailor/');
    expect(profile).not.toContain('example-tailor.webp 800w'); // one file: no srcset
    const list = await (await get('/tailors')).text();
    expect(list).toContain('/photos/tailors/example-tailor.webp');
  });

  it("puts the tailor's own uploaded photo first when there is one", async () => {
    const key = 'c'.repeat(32);
    const image = (
      await run(
        "INSERT INTO portfolio_image (tailor_id, file_key, alt_text, permission_granted) VALUES (?, ?, 'Own photo', 1)",
        tailorId,
        key,
      )
    ).meta.last_row_id as number;
    await run(
      'UPDATE portfolio_image SET is_profile_photo = 1 WHERE id = ?',
      image,
    );
    const profile = await (await get('/tailors/example-tailor')).text();
    expect(profile).toContain(`/media/tailor/${tailorId}/${key}/medium.jpg`);
    expect(profile).not.toContain('/photos/tailors/example-tailor.webp');
    expect(profile).not.toContain('example-tailor-2.webp');
    await run('DELETE FROM portfolio_image WHERE tailor_id = ?', tailorId);
  });

  it('shows the slug and the photo count to staff on the Photos tab, read only', async () => {
    const owner = await signIn('owner');
    const html = await (await get(`/admin/tailors/${tailorId}`, owner)).text();
    expect(html).toContain('Photos from the content editor');
    expect(html).toContain('<code>example-tailor</code>');
    expect(html).toContain(
      'href="/cms/#/collections/tailor_photos/entries/example-tailor"',
    );
    expect(html).toContain('Change photos');
    expect(html).toContain('2 photos set');
  });

  it('never shows them once the tailor is not published', async () => {
    await run('UPDATE tailor SET is_published = 0 WHERE id = ?', tailorId);
    expect((await get('/tailors/example-tailor')).status).toBe(404);
    expect(await (await get('/tailors')).text()).not.toContain(
      'example-tailor.webp',
    );
    expect(await (await get('/gallery')).text()).not.toContain(
      'example-tailor',
    );
  });

  it('is not tricked by a slug with no entry: no photo, the usual stand-in', async () => {
    await run(
      "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES ('cms-no-entry', 'Cms No Entry Fake', 'approved', 1, 1, 1, '+67033123457')",
    );
    const profile = await (await get('/tailors/cms-no-entry')).text();
    expect(profile).not.toContain('/photos/tailors/');
    // staff get a button that opens a new entry with this tailor filled in
    const id = (await env.DB.prepare(
      "SELECT id FROM tailor WHERE slug = 'cms-no-entry'",
    ).first<{ id: number }>())!.id;
    const admin = await (
      await get(`/admin/tailors/${id}`, await signIn('owner'))
    ).text();
    expect(admin).toContain(
      'href="/cms/#/collections/tailor_photos/new?slug=cms-no-entry"',
    );
    expect(admin).toContain('Add photos');
    expect(admin).toContain('No photo set yet.');
  });
});

describe('product photos from the content editor', () => {
  it('shows them on the shop list and the product page, and the product own photo wins', async () => {
    productId = (
      await run(
        "INSERT INTO product (slug, name, description, is_published) VALUES ('example-product', 'Cms Fake Product', 'A made-up product.', 1)",
      )
    ).meta.last_row_id as number;
    const list = await (await get('/shop')).text();
    expect(list).toContain('src="/photos/products/example-product.webp"');
    const page = await (await get('/shop/example-product')).text();
    expect(page).toContain('/photos/products/example-product.webp');
    expect(page).not.toContain('/media/shop/');
    const key = 'd'.repeat(32);
    await run(
      'INSERT INTO product_image (product_id, file_key, alt_text, permission_granted) VALUES (?, ?, ?, 1)',
      productId,
      key,
      'Own product photo',
    );
    const own = await (await get('/shop/example-product')).text();
    expect(own).toContain(`/media/shop/product/${productId}/${key}/medium.jpg`);
    expect(own).not.toContain('/photos/products/example-product.webp');
  });

  it('shows the slug to staff on the product page, and never for a draft product publicly', async () => {
    const owner = await signIn('owner');
    const html = await (
      await get(`/admin/products/${productId}`, owner)
    ).text();
    expect(html).toContain('<code>example-product</code>');
    expect(html).toContain(
      'href="/cms/#/collections/product_photos/entries/example-product"',
    );
    expect(html).toContain('1 photo set');
    await run('UPDATE product SET is_published = 0 WHERE id = ?', productId);
    expect((await get('/shop/example-product')).status).toBe(404);
    expect(await (await get('/shop')).text()).not.toContain(
      'example-product.webp',
    );
  });
});
