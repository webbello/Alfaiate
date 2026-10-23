import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, csrfOf, get, signIn, unique } from './helpers';
import { worker } from './worker';
import { issueToken } from '../../src/modules/enquiry/spam';

// Shop S3: a product enquiry is the ordinary request with products named. Same consent, spam checks and inbox; source "shop"; nothing is paid or ordered.
const db = env.DB;
const SECRET = 'integration-form-secret-0123456789';
const addProduct = async (name: string, published = 1) => {
  const slug = `se-${unique()}`;
  await db
    .prepare(
      'INSERT INTO product (slug, name, description, is_published) VALUES (?, ?, ?, ?)',
    )
    .bind(slug, name, 'A made-up description.', published)
    .run();
  return slug;
};
const send = async (products: string[], over: Record<string, string> = {}) => {
  const body = new URLSearchParams({
    form_token: await issueToken(SECRET, new Date(Date.now() - 10_000)),
    name: 'Fake Customer',
    phone: '7712 3456',
    channel: 'whatsapp',
    consent: 'yes',
    notes: 'Fake notes',
    ...over,
  });
  for (const p of products) body.append('product', p);
  return worker.fetch(
    new Request(`${ORIGIN}/request`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'cf-connecting-ip': `198.51.100.${unique() % 250}`,
        Origin: ORIGIN,
      },
      body: body.toString(),
      redirect: 'manual',
    }),
  );
};
const rowOf = async (location: string | null) =>
  db
    .prepare(
      'SELECT source, notes, preferred_tailor_id AS tailor FROM enquiry WHERE reference_code = ?',
    )
    .bind(new URL(location!, ORIGIN).searchParams.get('ref'))
    .first<{ source: string; notes: string; tailor: number | null }>();

describe('the request form with shop items', () => {
  it('names the published items, ignores drafts and extras, and carries each as a hidden field', async () => {
    const [a, b, c, d] = [
      await addProduct('Se Shirt Fake'),
      await addProduct('Se Cloth Fake'),
      await addProduct('Se Belt Fake'),
      await addProduct('Se Fourth Fake'),
    ];
    const draft = await addProduct('Se Draft Fake', 0);
    const html = await (
      await get(
        `/request?product=${a}&product=${draft}&product=${b}&product=${c}&product=${d}`,
      )
    ).text();
    expect(html).toContain(
      'You are asking about these shop items: Se Shirt Fake, Se Cloth Fake.',
    );
    expect(html).not.toContain('Se Draft Fake');
    expect(html).not.toContain('Se Belt Fake'); // the cap is three slugs and the draft took one slot
    expect(html).not.toContain('Se Fourth Fake');
    expect(html.match(/<input type="hidden" name="product"/g)).toHaveLength(2); // a and b
  });
  it('turns the Tetun form into Tetun and leaves a plain request unchanged', async () => {
    const a = await addProduct('Se Tetun Fake');
    expect(await (await get(`/tet/request?product=${a}`)).text()).toContain(
      'Ita husu kona-ba item loja nian sira ne',
    );
    expect(await (await get('/request')).text()).not.toContain('shop items');
  });
});

describe('sending a product enquiry', () => {
  it('stores one enquiry with source "shop" and the item names in the notes, after the usual consent and spam checks', async () => {
    const [a, b] = [
      await addProduct('Se Stored One Fake'),
      await addProduct('Se Stored Two Fake'),
    ];
    const r = await send([a, b]);
    expect(r.status).toBe(303);
    expect(await rowOf(r.headers.get('location'))).toEqual({
      source: 'shop',
      notes:
        'Fake notes\nAsked about shop items: Se Stored One Fake, Se Stored Two Fake',
      tailor: null,
    });
  });
  it('still needs consent, and refuses a missing token', async () => {
    const a = await addProduct('Se Consent Fake');
    expect((await send([a], { consent: '' })).status).toBe(400);
    expect((await send([a], { form_token: '' })).status).toBe(400);
  });
  it('stores a draft or unknown item as a plain request', async () => {
    const draft = await addProduct('Se Hidden Fake', 0);
    const r = await send([draft, 'no-such-item']);
    expect(await rowOf(r.headers.get('location'))).toEqual({
      source: 'form',
      notes: 'Fake notes',
      tailor: null,
    });
  });
  it('shows a Shop chip in the staff inbox and the source on the enquiry page', async () => {
    const a = await addProduct('Se Inbox Fake');
    const r = await send([a], { name: 'Fake Inbox Customer' });
    const ref = new URL(r.headers.get('location')!, ORIGIN).searchParams.get(
      'ref',
    )!;
    const manager = await signIn('manager');
    const list = await (await get(`/admin/enquiries?q=${ref}`, manager)).text();
    expect(list).toContain('Shop');
    const id = /href="\/admin\/enquiries\/(\d+)"/.exec(list)![1];
    const page = await (await get(`/admin/enquiries/${id}`, manager)).text();
    expect(page).toContain('Asked about shop items: Se Inbox Fake');
    expect(page).toContain('shop');
    expect(await csrfOf(manager)).not.toBe('');
  });
});

describe('the product page', () => {
  it('offers the request form with this item, an add-to-list button that works without a script, and a hidden list box', async () => {
    const a = await addProduct('Se Page Fake');
    const html = await (await get(`/shop/${a}`)).text();
    expect(html).toContain(`href="/request?product=${a}"`);
    expect(html).toMatch(
      new RegExp(
        `<form[^>]*method="get"[^>]*action="/request"[^>]*data-add-product[^>]*data-slug="${a}"`,
      ),
    );
    expect(html).toMatch(/<section[^>]*data-product-list[^>]*hidden/);
    expect(html).toContain(
      'Nothing is sent until you fill in and send the form.',
    );
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)/);
  });
});
