import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, get, unique } from './helpers';
import { worker } from './worker';
import { issueToken } from '../../src/modules/enquiry/spam';

// Handspark theme step 4: the cart is a request list. No prices, no quantities, no payment; up to three tailors; the visitor
// still sends one ordinary request form, so nothing is stored until they do (FR-ENQ-01, PRD §7.3).
const db = env.DB;
const SECRET = 'integration-form-secret-0123456789';
const addTailor = async (name: string, published = 1) => {
  const slug = `rl-${unique()}`;
  await db
    .prepare(
      "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded) VALUES (?, ?, 'approved', ?, ?)",
    )
    .bind(slug, name, published, published)
    .run();
  return slug;
};

describe('the request list panel', () => {
  it('is the theme cart (items, quantity, subtotal) with no checkout or payment, and a link to the request form', async () => {
    for (const [path, send] of [
      ['/', 'Request these tailors'],
      ['/tailors', 'Request these tailors'],
    ] as const) {
      const html = await (await get(path)).text();
      const panel = /<div class="header-cart"[\s\S]*?data-cart-empty/.exec(
        html,
      )![0];
      expect(panel, path).toContain('data-cart-send');
      expect(panel, path).toContain(send);
      expect(panel, path).toContain('data-request-href="/request"');
      // the theme's cart: a subtotal for shop items, but no checkout and no payment
      expect(panel, path).toContain('data-cart-subtotal');
      expect(panel, path).toContain('Subtotal');
      for (const word of ['Checkout', 'Pay now', 'Card number'])
        expect(panel, `${path} ${word}`).not.toContain(word);
      expect(panel, path).toContain('No payment is taken on this site');
      expect(panel, path).toContain('data-cart-order'); // shop items are ordered on WhatsApp
      expect(panel, path).toContain('Order on WhatsApp');
    }
    expect(await (await get('/tet/tailors')).text()).toContain(
      'data-request-href="/tet/request"',
    );
  });

  it('puts an "Add to my request list" button on each directory card and on the profile, posting nothing without a script', async () => {
    const slug = await addTailor('Rl Card Fake');
    const list = await (await get('/tailors')).text();
    expect(list).toContain('aria-label="Add Rl Card Fake to my request list"');
    expect(list).toMatch(
      new RegExp(
        `<form class="shop-bag-card"[^>]*data-add-to-cart[^>]*>[\\s\\S]*?name="tailor" value="${slug}"`,
      ),
    );
    const profile = await (await get(`/tailors/${slug}`)).text();
    expect(profile).toMatch(/data-add-to-cart/);
    expect(profile).toContain('Add to request list');
  });
});

describe('a request that names several tailors', () => {
  it('lists them in the notice and carries each as a hidden field, published ones only, at most three', async () => {
    const [a, b, c] = [
      await addTailor('Rl A Fake'),
      await addTailor('Rl B Fake'),
      await addTailor('Rl C Fake'),
    ];
    const draft = await addTailor('Rl Draft Fake', 0);
    const html = await (
      await get(
        `/request?tailor=${a}&tailor=${a}&tailor=${b}&tailor=${c}&tailor=${draft}`,
      )
    ).text();
    expect(html).toContain('Rl A Fake, Rl B Fake, Rl C Fake');
    expect(html).not.toContain('Rl Draft Fake');
    expect(html.match(/<input type="hidden" name="tailor"/g)).toHaveLength(3);
    const withDraft = await (
      await get(`/request?tailor=${a}&tailor=${draft}`)
    ).text();
    expect(withDraft).not.toContain('Rl Draft Fake');
    expect(withDraft.match(/name="tailor"/g)).toHaveLength(1);
  });

  it('stores the first as the preferred tailor and names the others in the notes', async () => {
    const [a, b] = [
      await addTailor('Rl One Fake'),
      await addTailor('Rl Two Fake'),
    ];
    const token = await issueToken(SECRET, new Date(Date.now() - 10_000));
    const body = new URLSearchParams({
      form_token: token,
      name: 'Fake Customer',
      phone: '7712 3456',
      channel: 'whatsapp',
      consent: 'yes',
      notes: 'Fake notes',
    });
    body.append('tailor', a);
    body.append('tailor', b);
    const response = await worker.fetch(
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
    expect(response.status).toBe(303);
    const ref = new URL(
      response.headers.get('location')!,
      ORIGIN,
    ).searchParams.get('ref')!;
    const row = await db
      .prepare(
        'SELECT notes, source, (SELECT slug FROM tailor WHERE id = preferred_tailor_id) AS preferred FROM enquiry WHERE reference_code = ?',
      )
      .bind(ref)
      .first<{ notes: string; source: string; preferred: string }>();
    expect(row!.preferred).toBe(a);
    expect(row!.source).toBe(`profile:${a}`);
    expect(row!.notes).toBe('Fake notes\nAlso asked about: Rl Two Fake');
  });
});
