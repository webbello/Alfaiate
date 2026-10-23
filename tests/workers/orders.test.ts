import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { orderMessage } from '../../src/modules/orders/messages';
import { resolveDestination } from '../../src/modules/orders/routing';
import {
  MAX_ORDER_LINES,
  whatsappOrderService,
} from '../../src/modules/orders/whatsapp-service';

// Shop S6: the cart becomes a WhatsApp order. Prices and sellers come from the database, and staff decide where each part goes.
const db = env.DB;
const ADMIN = '+67077000001';
const SITE = 'https://alfaiate-tl.example';
let n = 0;
const service = (adminNumber: string | null = ADMIN) =>
  whatsappOrderService({ db, adminNumber, siteName: 'Alfaiate TL' });
const place = (
  lines: { slug: string; quantity: number }[],
  adminNumber: string | null = ADMIN,
  clientKey?: string,
) =>
  service(adminNumber).place({ lines, lang: 'en', siteUrl: SITE, clientKey });

async function tailor(
  o: {
    route?: string;
    number?: string | null;
    whatsapp?: string | null;
    consent?: number;
    published?: number;
  } = {},
) {
  const slug = `ot-${++n}`;
  const id = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164, order_route, order_number_e164) VALUES (?, ?, 'approved', ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        slug,
        `Order Tailor ${n}`,
        o.published ?? 1,
        o.published ?? 1,
        o.consent ?? 1,
        o.whatsapp === undefined ? '+67033111222' : o.whatsapp,
        o.route ?? 'admin',
        o.number ?? null,
      )
      .run()
  ).meta.last_row_id as number;
  return { id, name: `Order Tailor ${n}` };
}
async function product(
  o: {
    name?: string;
    price?: number | null;
    seller?: number | null;
    published?: number;
    availability?: string;
    photo?: boolean;
  } = {},
) {
  const slug = `op-${++n}`;
  const id = (
    await db
      .prepare(
        'INSERT INTO product (slug, name, description, price_cents, seller_tailor_id, availability, is_published) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        slug,
        o.name ?? `Order Item ${n}`,
        'A made-up description.',
        o.price === undefined ? 2500 : o.price,
        o.seller ?? null,
        o.availability ?? 'available',
        o.published ?? 1,
      )
      .run()
  ).meta.last_row_id as number;
  if (o.photo)
    await db
      .prepare(
        'INSERT INTO product_image (product_id, file_key, alt_text) VALUES (?, ?, ?)',
      )
      .bind(id, 'f'.repeat(32), 'Fake photo')
      .run();
  return { slug, id };
}

describe('orderMessage', () => {
  const line = {
    slug: 'a-b',
    name: 'Linen *Shirt*',
    quantity: 2,
    priceCents: 3200,
    url: `${SITE}/shop/a-b`,
    imageUrl: `${SITE}/media/shop/product/1/${'a'.repeat(32)}/medium.jpg`,
    sellerName: null,
  };
  it('is a clear message: reference, each item with quantity, price, product and photo links, the total and blanks for the customer', () => {
    const text = orderMessage({
      reference: 'OR-ABCD2345',
      siteName: 'Alfaiate TL',
      lines: [line],
      subtotalCents: 6400,
      viaAdmin: true,
    });
    expect(text).toContain('*New order – Alfaiate TL*');
    expect(text).toContain('Order OR-ABCD2345');
    expect(text).toContain('*1. Linen Shirt* × 2');
    expect(text).toContain('$ 32.00 USD each = $ 64.00 USD');
    expect(text).toContain(`🔗 ${SITE}/shop/a-b`);
    expect(text).toContain('🖼 ');
    expect(text).toContain('*Total: $ 64.00 USD*');
    for (const blank of ['Name:', 'Delivery or pick-up place:', 'Notes:'])
      expect(text).toContain(blank);
    expect(text).toContain('No payment has been taken on the site');
    expect(text).not.toContain('*Shirt*'); // a product name cannot change the message's formatting
  });
  it('says when a price is to be confirmed and names the seller, noting the admin route', () => {
    const text = orderMessage({
      reference: 'OR-ABCD2345',
      siteName: 'Alfaiate TL',
      lines: [
        {
          ...line,
          priceCents: null,
          imageUrl: null,
          sellerName: 'Fake Tailor',
        },
      ],
      subtotalCents: 0,
      viaAdmin: true,
    });
    expect(text).toContain('Price: to be confirmed');
    expect(text).toContain('Seller: Fake Tailor (through the admin)');
    expect(text).toContain('items with no price are not in the total');
    expect(text).not.toContain('🖼');
  });
});

describe('resolveDestination', () => {
  const base = {
    tailorId: 1,
    name: 'Fake Tailor',
    orderRoute: 'admin' as const,
    orderNumber: null,
    whatsapp: '+67033111222',
    contactConsent: true,
  };
  it('sends the platform product and the default route to the admin, and only the chosen route to the tailor or a staff number', () => {
    expect(
      resolveDestination(
        { ...base, tailorId: null, orderRoute: 'tailor' },
        ADMIN,
        'Alfaiate TL',
      ).kind,
    ).toBe('admin');
    expect(resolveDestination(base, ADMIN, 'Alfaiate TL')).toEqual({
      kind: 'admin',
      number: ADMIN,
      label: 'Alfaiate TL',
    });
    expect(
      resolveDestination(
        { ...base, orderRoute: 'tailor' },
        ADMIN,
        'Alfaiate TL',
      ),
    ).toEqual({ kind: 'tailor', number: '+67033111222', label: 'Fake Tailor' });
    expect(
      resolveDestination(
        { ...base, orderRoute: 'number', orderNumber: '+91 88648 12200' },
        ADMIN,
        'Alfaiate TL',
      ),
    ).toEqual({
      kind: 'number',
      number: '+918864812200',
      label: 'Fake Tailor',
    });
  });
  it('falls back to the admin when the chosen number is missing, invalid or not shown with consent', () => {
    expect(
      resolveDestination(
        { ...base, orderRoute: 'tailor', contactConsent: false },
        ADMIN,
        'A',
      ).kind,
    ).toBe('admin');
    expect(
      resolveDestination(
        { ...base, orderRoute: 'tailor', whatsapp: null },
        ADMIN,
        'A',
      ).kind,
    ).toBe('admin');
    expect(
      resolveDestination(
        { ...base, orderRoute: 'number', orderNumber: 'not a number' },
        ADMIN,
        'A',
      ).kind,
    ).toBe('admin');
    expect(
      resolveDestination(
        { ...base, orderRoute: 'number', orderNumber: null },
        ADMIN,
        'A',
      ).kind,
    ).toBe('admin');
  });
});

describe('the WhatsApp order service', () => {
  it('prepares one message for the admin for the platform products, with prices read from the database', async () => {
    const a = await product({ name: 'Order Shirt', price: 3200, photo: true });
    const b = await product({ name: 'Order Cloth', price: 1000 });
    const r = await place([
      { slug: a.slug, quantity: 2 },
      { slug: b.slug, quantity: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.groups).toHaveLength(1);
    const g = r.order.groups[0]!;
    expect(g.destination).toEqual({
      kind: 'admin',
      number: ADMIN,
      label: 'Alfaiate TL',
    });
    expect(g.subtotalCents).toBe(7400);
    expect(
      g.whatsappUrl.startsWith(`https://wa.me/${ADMIN.slice(1)}?text=`),
    ).toBe(true);
    expect(decodeURIComponent(g.whatsappUrl.split('?text=')[1]!)).toBe(
      g.message,
    );
    expect(g.message).toContain(`${SITE}/shop/${a.slug}`);
    expect(g.message).toContain(
      `${SITE}/media/shop/product/${a.id}/${'f'.repeat(32)}/medium.jpg`,
    );
    expect(r.order.reference).toMatch(/^OR-[A-HJ-NP-Z2-9]{8}$/);
  });

  it('splits an order by destination: the admin for platform items and for admin-routed tailors, the tailor or another number when staff chose so', async () => {
    const own = await tailor({ route: 'tailor' });
    const shop = await tailor({ route: 'number', number: '+918864812200' });
    const adminRouted = await tailor({ route: 'admin' });
    const items = [
      await product(),
      await product({ seller: own.id }),
      await product({ seller: shop.id }),
      await product({ seller: adminRouted.id }),
    ];
    const r = await place(items.map((i) => ({ slug: i.slug, quantity: 1 })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byKind = Object.fromEntries(
      r.order.groups.map((g) => [g.destination.number, g.lines.length]),
    );
    expect(byKind).toEqual({
      [ADMIN]: 2,
      '+67033111222': 1,
      '+918864812200': 1,
    });
    const adminGroup = r.order.groups.find(
      (g) => g.destination.kind === 'admin',
    )!;
    expect(adminGroup.message).toContain('(through the admin)'); // staff see which tailor's item they are passing on
  });

  it('ignores drafts, unavailable items and products of an unpublished tailor, and reports what was skipped', async () => {
    const draft = await product({ published: 0 });
    const gone = await product({
      name: 'Order Gone',
      availability: 'unavailable',
    });
    const hiddenSeller = await tailor({ published: 0 });
    const theirs = await product({ seller: hiddenSeller.id });
    const ok = await product();
    const r = await place(
      [draft, gone, theirs, ok].map((i) => ({ slug: i.slug, quantity: 1 })),
    );
    expect(
      r.ok && r.order.groups.flatMap((g) => g.lines.map((l) => l.slug)),
    ).toEqual([ok.slug]);
    expect(r.ok && r.order.skipped).toContain('Order Gone');
    expect(await place([{ slug: draft.slug, quantity: 1 }])).toEqual({
      ok: false,
      error: 'empty',
    });
  });

  it('refuses odd input, too many lines, no cart, and an unset admin number', async () => {
    const a = await product();
    expect(await place([])).toEqual({ ok: false, error: 'empty' });
    for (const bad of [
      { slug: a.slug, quantity: 0 },
      { slug: a.slug, quantity: 100 },
      { slug: a.slug, quantity: 1.5 },
      { slug: 'Bad Slug!', quantity: 1 },
    ])
      expect(await place([bad]), JSON.stringify(bad)).toEqual({
        ok: false,
        error: 'invalid',
      });
    const many = await Promise.all(
      Array.from({ length: MAX_ORDER_LINES + 1 }, () => product()),
    );
    expect(
      await place(many.map((m) => ({ slug: m.slug, quantity: 1 }))),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(await place([{ slug: a.slug, quantity: 1 }], null)).toEqual({
      ok: false,
      error: 'not_set_up',
    });
  });

  it('records the order without any customer detail, and limits how many a connection can make', async () => {
    const a = await product({ name: 'Order Record Item', price: 1500 });
    const r = await place([{ slug: a.slug, quantity: 3 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = (await db
      .prepare('SELECT * FROM shop_order WHERE reference_code = ?')
      .bind(r.order.reference)
      .first<Record<string, unknown>>())!;
    expect(Object.keys(row).sort()).toEqual([
      'created_at',
      'id',
      'items_json',
      'reference_code',
      'routes_json',
      'total_cents',
    ]);
    expect(row.total_cents).toBe(4500);
    expect(JSON.parse(row.items_json as string)).toEqual([
      {
        slug: a.slug,
        name: 'Order Record Item',
        quantity: 3,
        priceCents: 1500,
      },
    ]);
    const key = `limit-${++n}`;
    let last = await place([{ slug: a.slug, quantity: 1 }], ADMIN, key);
    for (let i = 0; i < 30; i++)
      last = await place([{ slug: a.slug, quantity: 1 }], ADMIN, key);
    expect(last).toEqual({ ok: false, error: 'limited' });
  });
});
