import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// Shop S2: the public pages show published products only, name the seller, say nothing is paid here, and stay noindex until the owner approves (BR-13, BR-14).
const db = env.DB;
const add = async (
  o: {
    name?: string;
    published?: number;
    price?: number | null;
    unavailable?: boolean;
    category?: string;
    description?: string | null;
    note?: string | null;
  } = {},
) => {
  const slug = `shp-${unique()}`;
  const cat = o.category
    ? (await db
        .prepare('SELECT id FROM product_category WHERE slug = ?')
        .bind(o.category)
        .first<{ id: number }>())!.id
    : null;
  const id = (
    await db
      .prepare(
        'INSERT INTO product (slug, name, description, price_cents, price_note, category_id, availability, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        slug,
        o.name ?? `Shop Fake ${unique()}`,
        o.description === undefined
          ? 'A made-up product description.'
          : o.description,
        o.price === undefined ? 2050 : o.price,
        o.note ?? null,
        cat,
        o.unavailable ? 'unavailable' : 'available',
        o.published ?? 1,
      )
      .run()
  ).meta.last_row_id as number;
  return { slug, id };
};

describe('shop list', () => {
  it('shows published products with price, seller and the no-payment notice, and never a draft', async () => {
    const live = await add({ name: 'Shop Fake Shirt', price: 2050 });
    const draft = await add({ name: 'Shop Fake Draft', published: 0 });
    const response = await get('/shop');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Shop Fake Shirt');
    expect(html).toContain('$ 20.50 USD');
    expect(html).toContain('Sold by Alfaiate TL');
    expect(html).toContain('Nothing is paid or ordered on this site');
    expect(html).toContain(`href="/shop/${live.slug}"`);
    expect(html).not.toContain('Shop Fake Draft');
    expect(html).not.toContain(`/shop/${draft.slug}`);
    expect(html).toContain('name="robots" content="noindex,follow"');
  });
  it('says "Ask for the price" when there is none and flags an unavailable item', async () => {
    await add({ name: 'Shop Fake NoPrice', price: null });
    await add({ name: 'Shop Fake Gone', unavailable: true });
    const html = await (await get('/shop')).text();
    expect(html).toContain('Ask for the price');
    expect(html).toContain('Not available right now');
  });
  it('filters by type and answers 404 for an unknown or empty type', async () => {
    await add({ name: 'Shop Fake Fabric', category: 'fabrics' });
    const html = await (await get('/shop/category/fabrics')).text();
    expect(html).toContain('Shop Fake Fabric');
    expect(html).not.toContain('Shop Fake Shirt');
    expect((await get('/shop/category/no-such')).status).toBe(404);
    expect((await get('/shop/category/accessories')).status).toBe(404); // no published accessory in this test
  });
  it('turns hostile names into inert text, in both languages', async () => {
    await add({ name: '"><img src=x onerror=alert(1)>' });
    for (const path of ['/shop', '/tet/shop']) {
      const html = await (await get(path)).text();
      expect(html.replace(/="[^"]*"/g, '=""'), path).not.toContain(
        '<img src=x',
      );
      expect(html, path).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
  });
});

describe('product page', () => {
  it('shows the price note, seller, notice and a way to ask, with no payment form', async () => {
    const p = await add({
      name: 'Shop Fake Cloth',
      price: 1500,
      note: 'per metre',
    });
    const response = await get(`/shop/${p.slug}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('$ 15.00 USD');
    expect(html).toContain('per metre');
    expect(html).toContain('Price set by the seller');
    expect(html).toContain('Sold by Alfaiate TL');
    expect(html).toMatch(/data-shop-ask/);
    expect(html).toContain(`href="/request?product=${p.slug}"`); // the enquiry goes through the request form
    expect(html).not.toContain('data-shop-whatsapp'); // no owner WhatsApp in this test project
    expect(html).not.toMatch(/<form[^>]*(checkout|payment|order)/i);
    // structured data is written only on indexable pages, so none until the owner approves the shop; it never carries a rating, review or price
    expect(html).not.toMatch(/ratingValue|"offers":|"price":/);
  });
  it('is 404 for a draft and an unknown address, in both languages', async () => {
    const draft = await add({ published: 0 });
    for (const path of [
      `/shop/${draft.slug}`,
      '/shop/no-such-product',
      `/tet/shop/${draft.slug}`,
    ])
      expect((await get(path)).status, path).toBe(404);
  });
  it('speaks Tetun on the twin and links back to the shop', async () => {
    const p = await add({ name: 'Shop Fake Tetun' });
    const html = await (await get(`/tet/shop/${p.slug}`)).text();
    expect(html).toContain('<html lang="tet">');
    expect(html).toContain('// Loja');
    expect(html).toContain('href="/tet/shop"');
  });
  it('lists photos with alt text from the public shop route only', async () => {
    const p = await add({ name: 'Shop Fake Photo' });
    await db
      .prepare(
        'INSERT INTO product_image (product_id, file_key, alt_text) VALUES (?, ?, ?)',
      )
      .bind(p.id, 'a'.repeat(32), 'A fake cloth photo')
      .run();
    const html = await (await get(`/shop/${p.slug}`)).text();
    expect(html).toContain(
      `/media/shop/product/${p.id}/${'a'.repeat(32)}/medium.jpg`,
    );
    expect(html).toContain('alt="A fake cloth photo"');
    expect(html).not.toMatch(/\/media\/tailor|\/admin\/media/);
  });
});

describe('shop in the menu and the sitemap', () => {
  it('is linked from the header and footer, but its pages are not in the sitemap until approved', async () => {
    const p = await add({ name: 'Shop Fake Mapped' });
    const home = await (await get('/')).text();
    expect(home).toContain('href="/shop"');
    const sitemap = await (await get('/sitemap.xml')).text();
    expect(sitemap).not.toContain('/shop');
    expect(sitemap).not.toContain(p.slug);
  });
});
