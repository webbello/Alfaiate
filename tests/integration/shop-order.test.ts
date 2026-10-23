import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, csrfOf, get, post, signIn, unique } from './helpers';
import { worker } from './worker';
import { createTailorSession } from '../../src/modules/portal/session';

// Shop S6 through the real pages: the cart becomes an order page that opens WhatsApp; staff decide where each part goes; a tailor cannot change it.
const db = env.DB;
const ADMIN_DIGITS = '67077000001'; // ORDER_WHATSAPP in the test project (a fake number)
const tailor = async (name: string, live = 1) => {
  const slug = `so-${unique()}`;
  const id = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164) VALUES (?, ?, 'approved', ?, ?, 1, '+67033999888')",
      )
      .bind(slug, name, live, live)
      .run()
  ).meta.last_row_id as number;
  return { id, slug };
};
const product = async (
  name: string,
  o: { seller?: number | null; price?: number | null } = {},
) => {
  const slug = `so-${unique()}`;
  await db
    .prepare(
      "INSERT INTO product (slug, name, description, price_cents, seller_tailor_id, is_published) VALUES (?, ?, 'A made-up description.', ?, ?, 1)",
    )
    .bind(slug, name, o.price === undefined ? 2000 : o.price, o.seller ?? null)
    .run();
  return slug;
};
const order = (
  path: string,
  fields: [string, string][],
  ip = `198.51.100.${unique() % 250}`,
) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        'cf-connecting-ip': ip,
      },
      body: new URLSearchParams(fields).toString(),
      redirect: 'manual',
    }),
  );
const messageOf = (html: string) =>
  decodeURIComponent(
    /href="https:\/\/wa\.me\/\d+\?text=([^"]+)"/
      .exec(html)![1]!
      .replace(/&amp;/g, '&'),
  );

describe('the order page', () => {
  it('opens WhatsApp for the admin with a well-formed message, prices from the server, and records the order', async () => {
    const a = await product('So Linen Shirt', { price: 3200 });
    const b = await product('So Cloth', { price: 1000 });
    const r = await order('/order', [
      ['product', a],
      ['qty_' + a, '2'],
      ['product', b],
      ['qty_' + b, '1'],
      ['price', '0.01'],
      ['qty_' + b + 'x', '9'],
    ]);
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('Your order is ready');
    expect(html).toContain(`https://wa.me/${ADMIN_DIGITS}?text=`);
    expect(html).toContain('data-order-open'); // one destination: WhatsApp opens by itself
    expect(html).toContain('name="robots" content="noindex');
    const text = messageOf(html);
    expect(text).toContain('*1. So Linen Shirt* × 2');
    expect(text).toContain('$ 32.00 USD each = $ 64.00 USD');
    expect(text).toContain('*Total: $ 74.00 USD*'); // a price sent by the browser changes nothing
    expect(text).toContain(`/shop/${a}`);
    const ref = /Order (OR-[A-HJ-NP-Z2-9]{8})/.exec(text)![1]!;
    expect(html).toContain(ref);
    expect(
      await db
        .prepare(
          'SELECT total_cents AS t FROM shop_order WHERE reference_code = ?',
        )
        .bind(ref)
        .first(),
    ).toEqual({ t: 7400 });
  });

  it('gives one button per destination when the items have different sellers', async () => {
    const owner = await tailor('So Shop Owner Tailor');
    await db
      .prepare(
        "UPDATE tailor SET order_route = 'number', order_number_e164 = '+918864812200' WHERE id = ?",
      )
      .bind(owner.id)
      .run();
    const mine = await product('So Platform Item');
    const theirs = await product('So Tailor Item', { seller: owner.id });
    const html = await (
      await order('/order', [
        ['product', mine],
        ['product', theirs],
      ])
    ).text();
    expect(html).toContain('more than one seller');
    expect(html).toContain(`https://wa.me/${ADMIN_DIGITS}?text=`);
    expect(html).toContain('https://wa.me/918864812200?text=');
    expect(html).not.toContain('data-order-open'); // two choices: the customer taps each
    expect(html).toContain('Send to So Shop Owner Tailor');
  });

  it('sends a tailor item to the admin first by default, whatever the tailor chooses', async () => {
    const t = await tailor('So Default Route Tailor');
    const slug = await product('So Routed Item', { seller: t.id });
    const html = await (await order('/order', [['product', slug]])).text();
    expect(html).toContain(`https://wa.me/${ADMIN_DIGITS}?text=`);
    expect(html).not.toContain('wa.me/67033999888');
    expect(messageOf(html)).toContain(
      'Seller: So Default Route Tailor (through the admin)',
    );
  });

  it('answers in Tetun on the twin, sends visits without a cart back to the shop, and refuses odd quantities', async () => {
    const a = await product('So Tetun Item');
    expect(
      await (await order('/tet/order', [['product', a]])).text(),
    ).toContain('Ita-nia enkomenda prontu');
    for (const [path, to] of [
      ['/order', '/shop'],
      ['/tet/order', '/tet/shop'],
    ] as const) {
      const r = await get(path);
      expect(r.status).toBe(303);
      expect(r.headers.get('location')).toBe(to);
    }
    expect((await order('/order', [])).headers.get('location')).toBe('/shop');
    expect(
      (
        await order('/order', [
          ['product', a],
          ['qty_' + a, '500'],
        ])
      ).status,
    ).toBe(200); // a quantity out of range counts as one
    expect(
      (await order('/order', [['product', 'no-such-item']])).headers.get(
        'location',
      ),
    ).toBe('/shop');
  });

  it('has the order form in the cart on every page, and no checkout or payment', async () => {
    const html = await (await get('/shop')).text();
    expect(html).toMatch(/<form[^>]*action="\/order"[^>]*data-cart-order/);
    expect(html).toContain('Order on WhatsApp');
    expect(html).not.toMatch(/checkout|card number|pay now/i);
  });
});

describe('who decides where orders go', () => {
  it('lets a manager choose the route, checks the number, and refuses an editor and a viewer', async () => {
    const t = await tailor('So Admin Route Tailor');
    const manager = await signIn('manager');
    const csrf = await csrfOf(manager);
    expect(
      (
        await post(`/admin/tailors/${t.id}/orders`, manager, {
          csrf,
          order_route: 'number',
          order_number: '+91 88648 12200',
        })
      ).headers.get('location'),
    ).toContain('msg=saved');
    expect(
      await db
        .prepare(
          'SELECT order_route AS r, order_number_e164 AS n FROM tailor WHERE id = ?',
        )
        .bind(t.id)
        .first(),
    ).toEqual({ r: 'number', n: '+918864812200' });
    expect(
      (
        await post(`/admin/tailors/${t.id}/orders`, manager, {
          csrf,
          order_route: 'number',
          order_number: 'abc',
        })
      ).headers.get('location'),
    ).toContain('msg=invalid');
    expect(
      (
        await post(`/admin/tailors/${t.id}/orders`, manager, {
          csrf,
          order_route: 'anywhere',
        })
      ).headers.get('location'),
    ).toContain('msg=invalid');
    expect(
      (
        await post(`/admin/tailors/${t.id}/orders`, manager, {
          csrf,
          order_route: 'tailor',
        })
      ).headers.get('location'),
    ).toContain('msg=saved');
    expect(
      await db
        .prepare(
          'SELECT order_route AS r, order_number_e164 AS n FROM tailor WHERE id = ?',
        )
        .bind(t.id)
        .first(),
    ).toEqual({ r: 'tailor', n: null });
    expect(
      (
        await post(`/admin/tailors/${t.id}/orders`, manager, {
          order_route: 'admin',
        })
      ).status,
    ).toBe(403); // no csrf token
    for (const role of ['editor', 'viewer']) {
      const cookie = await signIn(role);
      expect(
        (
          await post(`/admin/tailors/${t.id}/orders`, cookie, {
            csrf: await csrfOf(cookie),
            order_route: 'admin',
          })
        ).status,
      ).toBe(403);
    }
    const page = await (await get(`/admin/tailors/${t.id}`, manager)).text();
    expect(page).toContain('Shop orders');
    expect(page).toContain('name="order_route"');
  });

  it("a tailor cannot change it: the portal ignores an order route in a submitted form, and the tailor's page does not show it", async () => {
    const t = await tailor('So Sneaky Tailor');
    const accountId = (
      await db
        .prepare(
          "INSERT INTO tailor_account (tailor_id, email, password_hash, consent_at) VALUES (?, ?, 'x', 'now')",
        )
        .bind(t.id, `so${unique()}@example.test`)
        .run()
    ).meta.last_row_id as number;
    const cookie = `__Host-alfaiate_tailor=${(await createTailorSession(db, accountId)).token}`;
    const profile = await (await get('/portal/profile', cookie)).text();
    expect(profile).not.toContain('order_route');
    const csrf = /name="csrf" value="([^"]+)"/.exec(profile)![1]!;
    await post('/portal/profile', cookie, {
      csrf,
      display_name: 'So Sneaky Tailor',
      description: 'x',
      order_route: 'tailor',
      order_number: '+10000000000',
    });
    expect(
      await db
        .prepare(
          'SELECT order_route AS r, order_number_e164 AS n FROM tailor WHERE id = ?',
        )
        .bind(t.id)
        .first(),
    ).toEqual({ r: 'admin', n: null });
  });

  it('lists orders for staff with items and destination but no customer detail', async () => {
    const a = await product('So Listed Item', { price: 1250 });
    const html = await (
      await order('/order', [
        ['product', a],
        ['qty_' + a, '3'],
      ])
    ).text();
    const ref = /Order (OR-[A-HJ-NP-Z2-9]{8})/.exec(messageOf(html))![1]!;
    const list = await (
      await get('/admin/orders', await signIn('manager'))
    ).text();
    expect(list).toContain(ref);
    expect(list).toContain('So Listed Item × 3');
    expect(list).toContain('the admin');
    expect((await get('/admin/orders', await signIn('editor'))).status).toBe(
      403,
    );
  });
});
