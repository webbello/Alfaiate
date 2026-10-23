import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, get, unique } from './helpers';
import { worker } from './worker';

// NFR-PERF-01: byte budgets for the pages the pilot cares about, measured on a fixed dataset below. Budgets are what `npm run perf` measured
// plus about 20% headroom (see IMPLEMENTATION_PLAN.md, Phases 7 and 7c). Sizes are uncompressed bytes, which do not vary from run to run.
const db = env.DB;
const assetsOf = async (html: string, pattern: RegExp) => {
  let total = 0;
  for (const match of html.matchAll(pattern)) {
    const response = await worker.fetch(new Request(`${ORIGIN}${match[1]}`));
    expect(response.status, match[1]).toBe(200);
    total += (await response.arrayBuffer()).byteLength;
  }
  return total;
};
let slug = '';
const seed = async () => {
  slug = `bg-${unique()}`;
  const id = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, description, shop_address_text, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164, phone_e164, home_visits) VALUES (?, 'Budget Fake Tailor', 'A short made-up description of a tailor who makes suits, dresses and shirts for customers in Dili.', 'Rua Fake 1', 'approved', 1, 1, 1, '+67077123456', '+67033123456', 'yes')",
      )
      .bind(slug)
      .run()
  ).meta.last_row_id as number;
  const cat = (
    await db
      .prepare(
        "INSERT INTO garment_category (slug, name) VALUES ('bg-suits', 'Suits')",
      )
      .run()
  ).meta.last_row_id as number;
  await db
    .prepare(
      'INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to) VALUES (?, ?, 2000, 5000)',
    )
    .bind(id, cat)
    .run();
  await db
    .prepare(
      "INSERT INTO service_area (slug, name) VALUES ('bg-area', 'Fake Area')",
    )
    .run();
  return 'bg-suits';
};

// Uncompressed bytes, measured on 2026-10-19 after Phase 7d (the owner's reference design): home 21505, directory 6611, category 4997, profile 6381,
// request 9418, how-it-works 6222, join 6291; site CSS 14854, home CSS 27493 (site plus home sheet), admin CSS 6852; JS 410 (header menu) and 745 on the
// home page (menu plus carousel); display font 17 KB (font.test.ts). The HTML budgets include the footer newsletter form (about 1.6 KB),
// which this test project switches on; directory and category pages also carry the four-question FAQ (about 2 KB) and link lists; production serves it only once NEWSLETTER_ENABLED is true. Each budget is the measurement plus about 20%. Scene photos are not counted here:
// they are lazy except the hero, and `npm run perf` reports them.
const BUDGET = {
  html: {
    home: 27700,
    directory: 10000, // +200: visible "View Profile" button on each card (2026-10-23)
    category: 10400,
    profile: 9600,
    request: 13200,
    howItWorks: 9400,
    join: 9500,
  },
  css: 21000, // raised 2026-10-21 for the compact directory (filter bar, chips, phone rows): measured 18084 plus margin
  homeCss: 36000, // raised 2026-10-21 for the compact directory and request form (site sheet grew); measured 33601
  adminCss: 12000, // sidebar shell and form grid (admin redesign, 2026-10-23); re-measure in T8
  js: 1500, // raised 2026-10-21: the directory page adds the filter script (measured 1195 with the header menu)
} as const;

describe('page weight budgets (NFR-PERF-01)', () => {
  it('keeps each page, its stylesheet and its script within budget', async () => {
    const cat = await seed();
    const pages = {
      home: '/',
      directory: '/tailors',
      category: `/categories/${cat}`,
      profile: `/tailors/${slug}`,
      request: '/request',
      howItWorks: '/how-it-works',
      join: '/join',
    } as const;
    for (const [name, path] of Object.entries(pages) as [
      keyof typeof pages,
      string,
    ][]) {
      const html = await (await get(path)).text();
      expect(
        new TextEncoder().encode(html).length,
        `${name} html`,
      ).toBeLessThanOrEqual(BUDGET.html[name]);
      expect(
        await assetsOf(html, /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g),
        `${name} css`,
      ).toBeLessThanOrEqual(name === 'home' ? BUDGET.homeCss : BUDGET.css);
      expect(
        await assetsOf(html, /<script[^>]*src="([^"]+)"/g),
        `${name} js`,
      ).toBeLessThanOrEqual(BUDGET.js);
    }
  });

  it('loads no third-party resources and no web fonts', async () => {
    for (const path of ['/', '/tailors', '/request']) {
      const html = await (await get(path)).text();
      // resources only: links to wa.me on tailor cards are navigation, not something the page loads
      expect(html, path).not.toMatch(
        /<(img|script|link|source|iframe)\b[^>]*\b(src|href|srcset)="https?:\/\/(?!alfaiate-tl\.example)/,
      );
      expect(html, path).not.toMatch(/@font-face|fonts\.googleapis/);
    }
  });
});

describe('the admin stylesheet stays small (Phase 7b)', () => {
  it('serves a stylesheet within its budget and no admin script', async () => {
    const html = await (await get('/admin/login')).text();
    expect(
      await assetsOf(html, /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g),
    ).toBeLessThanOrEqual(BUDGET.adminCss);
    expect(html).not.toContain('<script');
  });
});

describe('images are sized, described and lazy (NFR-PERF-01, NFR-A11Y-01)', () => {
  it('every image on the directory and the profile has alt text, srcset and sizes; all but the profile hero are lazy', async () => {
    const id = (
      await db
        .prepare(
          "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES (?, 'Photo Fake Tailor', 'approved', 1, 1, 1, '+67033123456')",
        )
        .bind(`bgp-${unique()}`)
        .run()
    ).meta.last_row_id as number;
    const photo = async (key: string) =>
      (
        await db
          .prepare(
            "INSERT INTO portfolio_image (tailor_id, file_key, alt_text, permission_granted) VALUES (?, ?, 'Fake photo description', 1)",
          )
          .bind(id, key)
          .run()
      ).meta.last_row_id as number;
    const first = await photo(unique().toString(16).padStart(32, '0'));
    await photo(unique().toString(16).padStart(32, '0'));
    await db
      .prepare('UPDATE tailor SET profile_photo_id = ? WHERE id = ?')
      .bind(first, id)
      .run();
    const slugOf = (await db
      .prepare('SELECT slug FROM tailor WHERE id = ?')
      .bind(id)
      .first<{ slug: string }>())!.slug;
    for (const path of ['/tailors', `/tailors/${slugOf}`]) {
      const html = await (await get(path)).text();
      const images = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
      expect(images.length, path).toBeGreaterThan(0);
      images.forEach((tag, index) => {
        expect(tag, `${path} alt`).toMatch(/\balt="[^"]+"/);
        expect(tag, `${path} srcset`).toMatch(/\bsrcset="[^"]+"/);
        expect(tag, `${path} sizes`).toMatch(/\bsizes="[^"]+"/);
        const hero = path.startsWith('/tailors/') && index === 0;
        if (!hero) expect(tag, `${path} lazy`).toContain('loading="lazy"');
      });
    }
  });
});
