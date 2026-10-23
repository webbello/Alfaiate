import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, csrfOf, get, post, signIn, unique } from './helpers';
import { worker } from './worker';
import { createTailorSession } from '../../src/modules/portal/session';
import { jpeg } from '../workers/fixtures/images';

// Shop S4: an approved tailor drafts their own products and photos in the portal; staff publish; the product is public only while the tailor is
// published with recorded permission. One tailor never reaches another's products (FR-TPO-03, BR-14).
const db = env.DB;
const bytes = (width: number, height: number) =>
  jpeg({ width, height }).slice().buffer as ArrayBuffer;

async function tailor(name: string, live = true) {
  const tailorId = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES (?, ?, ?, ?, ?, 1, '+67033123456')",
      )
      .bind(
        `sp-${unique()}`,
        name,
        live ? 'approved' : 'draft',
        live ? 1 : 0,
        live ? 1 : 0,
      )
      .run()
  ).meta.last_row_id as number;
  const accountId = (
    await db
      .prepare(
        'INSERT INTO tailor_account (tailor_id, email, password_hash, consent_at) VALUES (?, ?, ?, ?)',
      )
      .bind(tailorId, `sp${unique()}@example.test`, 'x', 'now')
      .run()
  ).meta.last_row_id as number;
  const cookie = `__Host-alfaiate_tailor=${(await createTailorSession(db, accountId)).token}`;
  return {
    tailorId,
    cookie,
    slug: (await db
      .prepare('SELECT slug FROM tailor WHERE id = ?')
      .bind(tailorId)
      .first<{ slug: string }>())!.slug,
  };
}
const tokenOf = async (cookie: string) => {
  const html = await (await get('/portal/products', cookie)).text();
  return html.match(/name="csrf" value="([^"]+)"/)![1];
};
const addProduct = async (
  t: { cookie: string },
  name: string,
  extra: Record<string, string> = {},
) => {
  const r = await post('/portal/products', t.cookie, {
    csrf: await tokenOf(t.cookie),
    name,
    description: 'A made-up description.',
    price: '30',
    ...extra,
  });
  return {
    r,
    id: Number(
      /\/portal\/products\/(\d+)/.exec(r.headers.get('location') ?? '')?.[1],
    ),
  };
};
const upload = async (
  t: { cookie: string },
  id: number,
  over: { confirm?: boolean; alt?: string } = {},
) => {
  const form = new FormData();
  form.set('csrf', await tokenOf(t.cookie));
  form.set('alt_text', over.alt ?? 'A fake tailor product');
  if (over.confirm !== false) form.set('confirm', 'yes');
  form.set(
    'thumb',
    new File([bytes(320, 240)], 'thumb.jpg', { type: 'image/jpeg' }),
  );
  form.set(
    'medium',
    new File([bytes(800, 600)], 'medium.jpg', { type: 'image/jpeg' }),
  );
  form.set(
    'large',
    new File([bytes(1600, 1200)], 'large.jpg', { type: 'image/jpeg' }),
  );
  return post(`/portal/products/${id}/photo`, t.cookie, form);
};
const publish = async (id: number, action = 'publish') => {
  const manager = await signIn('manager');
  return post(`/admin/products/${id}/publish`, manager, {
    csrf: await csrfOf(manager),
    action,
  });
};

describe('a tailor adds their own product', () => {
  it('saves a draft that belongs to them, shows it in their list only, and keeps it off the public shop', async () => {
    const a = await tailor('Sp Tailor A');
    const b = await tailor('Sp Tailor B');
    const { r, id } = await addProduct(a, 'Sp Fake Waistcoat');
    expect(r.status).toBe(303);
    expect(
      await db
        .prepare(
          'SELECT seller_tailor_id AS s, is_published AS p FROM product WHERE id = ?',
        )
        .bind(id)
        .first(),
    ).toEqual({ s: a.tailorId, p: 0 });
    expect(await (await get('/portal/products', a.cookie)).text()).toContain(
      'Sp Fake Waistcoat',
    );
    expect(
      await (await get('/portal/products', b.cookie)).text(),
    ).not.toContain('Sp Fake Waistcoat');
    expect(await (await get('/shop')).text()).not.toContain(
      'Sp Fake Waistcoat',
    );
  });

  it('refuses bad input and a missing csrf token, and a visitor or a staff cookie', async () => {
    const a = await tailor('Sp Tailor Bad');
    const bad = await addProduct(a, 'Sp Fake Bad Price', { price: 'twelve' });
    expect(bad.r.headers.get('location')).toContain('msg=invalid&fields=price');
    expect(
      (await post('/portal/products', a.cookie, { name: 'No Token' })).status,
    ).toBe(403);
    const anon = await get('/portal/products');
    expect([301, 302, 303]).toContain(anon.status);
    expect(anon.headers.get('location')).toBe('/portal/login');
    const staff = await get('/portal/products', await signIn('owner'));
    expect(staff.headers.get('location')).toBe('/portal/login');
  });
});

describe('isolation between tailors (FR-TPO-03)', () => {
  it("answers 404 to another tailor's product page, edit, photo upload and photo preview, and to a staff product", async () => {
    const a = await tailor('Sp Owner');
    const b = await tailor('Sp Other');
    const { id } = await addProduct(a, 'Sp Fake Private Draft');
    await upload(a, id);
    const key = (await db
      .prepare('SELECT file_key FROM product_image WHERE product_id = ?')
      .bind(id)
      .first<{ file_key: string }>())!.file_key;
    expect((await get(`/portal/products/${id}`, b.cookie)).status).toBe(404);
    expect(
      (
        await post(`/portal/products/${id}`, b.cookie, {
          csrf: await tokenOf(b.cookie),
          name: 'Hijacked',
          description: 'x',
        })
      ).status,
    ).toBe(404);
    expect((await upload(b, id)).status).toBe(404);
    expect(
      (await get(`/portal/media/product/${id}/${key}/thumb.jpg`, b.cookie))
        .status,
    ).toBe(404);
    expect(
      (await get(`/portal/media/product/${id}/${key}/thumb.jpg`, a.cookie))
        .status,
    ).toBe(200);
    expect(
      (await db
        .prepare('SELECT name FROM product WHERE id = ?')
        .bind(id)
        .first<{ name: string }>())!.name,
    ).toBe('Sp Fake Private Draft');
    const platform = (
      await db
        .prepare(
          "INSERT INTO product (slug, name, description) VALUES (?, 'Sp Fake Platform Item', 'x')",
        )
        .bind(`sp-${unique()}`)
        .run()
    ).meta.last_row_id as number;
    expect((await get(`/portal/products/${platform}`, a.cookie)).status).toBe(
      404,
    );
    expect(
      await (await get('/portal/products', a.cookie)).text(),
    ).not.toContain('Sp Fake Platform Item');
  });

  it('cannot publish: the admin publish route does not accept a tailor session', async () => {
    const a = await tailor('Sp No Publish');
    const { id } = await addProduct(a, 'Sp Fake Unpublishable');
    const res = await worker.fetch(
      new Request(`${ORIGIN}/admin/products/${id}/publish`, {
        method: 'POST',
        headers: { Origin: ORIGIN, Cookie: a.cookie },
        body: new URLSearchParams({ csrf: 'x', action: 'publish' }),
        redirect: 'manual',
      }),
    );
    expect(res.headers.get('location')).toBe('/admin/login');
    expect(
      (await db
        .prepare('SELECT is_published AS p FROM product WHERE id = ?')
        .bind(id)
        .first<{ p: number }>())!.p,
    ).toBe(0);
  });
});

describe('photos of a tailor product (BR-14)', () => {
  it('need the tailor to confirm, record that confirmation, and stay private until staff publish', async () => {
    const a = await tailor('Sp Photo Tailor');
    const { id } = await addProduct(a, 'Sp Fake Photo Item');
    expect(
      (await upload(a, id, { confirm: false })).headers.get('location'),
    ).toContain('msg=not_confirmed');
    expect((await upload(a, id)).headers.get('location')).toContain(
      'msg=uploaded',
    );
    const row = (await db
      .prepare(
        'SELECT file_key AS k, permission_granted AS g, permission_date AS d FROM product_image WHERE product_id = ?',
      )
      .bind(id)
      .first<{ k: string; g: number; d: string }>())!;
    expect(row.g).toBe(1);
    expect(row.d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const url = `/media/shop/product/${id}/${row.k}/medium.jpg`;
    expect((await get(url)).status).toBe(404); // a draft
    expect((await publish(id)).headers.get('location')).toContain(
      'msg=published',
    );
    expect((await get(url)).status).toBe(200);
    expect((await publish(id, 'unpublish')).headers.get('location')).toContain(
      'msg=unpublished',
    );
    expect((await get(url)).status).toBe(404);
  });

  it('are hidden again when the permission is withdrawn, even on a published product', async () => {
    const a = await tailor('Sp Revoke Tailor');
    const { id } = await addProduct(a, 'Sp Fake Revoked Item');
    await upload(a, id, { alt: 'Sp revoked alt' });
    await publish(id);
    const row = (await db
      .prepare('SELECT file_key AS k FROM product_image WHERE product_id = ?')
      .bind(id)
      .first<{ k: string }>())!;
    expect(
      await (
        await get(
          `/shop/${(await db.prepare('SELECT slug FROM product WHERE id = ?').bind(id).first<{ slug: string }>())!.slug}`,
        )
      ).text(),
    ).toContain('Sp revoked alt');
    await db
      .prepare(
        'UPDATE product_image SET permission_granted = 0 WHERE product_id = ?',
      )
      .bind(id)
      .run();
    expect(
      (await get(`/media/shop/product/${id}/${row.k}/medium.jpg`)).status,
    ).toBe(404);
    const slug = (await db
      .prepare('SELECT slug FROM product WHERE id = ?')
      .bind(id)
      .first<{ slug: string }>())!.slug;
    expect(await (await get(`/shop/${slug}`)).text()).not.toContain(
      'Sp revoked alt',
    );
  });
});

describe('publishing a tailor product', () => {
  it('shows the tailor as seller with the supplied-by-the-tailor label and the tailor notice, and locks the tailor out of edits', async () => {
    const a = await tailor('Sp Seller Tailor');
    const { id } = await addProduct(a, 'Sp Fake Seller Item');
    expect((await publish(id)).headers.get('location')).toContain(
      'msg=published',
    );
    const slug = (await db
      .prepare('SELECT slug FROM product WHERE id = ?')
      .bind(id)
      .first<{ slug: string }>())!.slug;
    const html = await (await get(`/shop/${slug}`)).text();
    expect(html).toContain('Sold by Sp Seller Tailor');
    expect(html).toContain('Description and price supplied by the tailor');
    expect(html).toContain('agreed directly with the tailor');
    expect(html).toContain(`href="/tailors/${a.slug}"`);
    expect(await (await get('/shop')).text()).toContain(
      'Sold by Sp Seller Tailor',
    );
    const edit = await post(`/portal/products/${id}`, a.cookie, {
      csrf: await tokenOf(a.cookie),
      name: 'Sp Changed After Publish',
      description: 'x',
    });
    expect(edit.headers.get('location')).toContain('msg=locked');
    expect(
      (await db
        .prepare('SELECT name FROM product WHERE id = ?')
        .bind(id)
        .first<{ name: string }>())!.name,
    ).toBe('Sp Fake Seller Item');
    expect((await upload(a, id)).headers.get('location')).toContain(
      'msg=locked',
    );
  });

  it('is refused while the seller tailor is not published, and disappears when the tailor is unpublished', async () => {
    const draftTailor = await tailor('Sp Draft Seller', false);
    const first = await addProduct(draftTailor, 'Sp Fake Draft Seller Item');
    expect((await publish(first.id)).headers.get('location')).toContain(
      'msg=seller_not_published',
    );
    const a = await tailor('Sp Later Unpublished');
    const { id } = await addProduct(a, 'Sp Fake Vanishing Item');
    await publish(id);
    const slug = (await db
      .prepare('SELECT slug FROM product WHERE id = ?')
      .bind(id)
      .first<{ slug: string }>())!.slug;
    expect((await get(`/shop/${slug}`)).status).toBe(200);
    await db
      .prepare('UPDATE tailor SET is_published = 0 WHERE id = ?')
      .bind(a.tailorId)
      .run();
    expect((await get(`/shop/${slug}`)).status).toBe(404);
    expect(await (await get('/shop')).text()).not.toContain(
      'Sp Fake Vanishing Item',
    );
  });

  it('shows the seller in the staff product list', async () => {
    const a = await tailor('Sp Listed Seller');
    await addProduct(a, 'Sp Fake Staff View Item');
    const list = await (
      await get('/admin/products', await signIn('manager'))
    ).text();
    expect(list).toContain('Sp Fake Staff View Item');
    expect(list).toContain('Sp Listed Seller');
  });
});

describe('limits', () => {
  it('stops at 20 products a tailor', async () => {
    const a = await tailor('Sp Many Products');
    for (let i = 0; i < 20; i++)
      await db
        .prepare(
          "INSERT INTO product (slug, name, seller_tailor_id) VALUES (?, 'Sp Fake Many', ?)",
        )
        .bind(`sp-m-${unique()}`, a.tailorId)
        .run();
    const r = await addProduct(a, 'Sp Fake One Too Many');
    expect(r.r.headers.get('location')).toContain('msg=limit');
  });
});
