import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

const db = env.DB;
type Seed = {
  name: string;
  published?: boolean;
  home?: 'yes' | 'no' | 'unknown';
  categories?: number[];
  areas?: number[];
  photo?: { permission: number; visible: number; alt: string };
  price?: [number, number];
};

async function tailor(o: Seed) {
  const id = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, home_visits, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES (?, ?, ?, ?, ?, ?, 1, '+67033123456')",
      )
      .bind(
        `dir-${unique()}`,
        o.name,
        o.home ?? 'unknown',
        (o.published ?? true) ? 'approved' : 'draft',
        (o.published ?? true) ? 1 : 0,
        (o.published ?? true) ? 1 : 0,
      )
      .run()
  ).meta.last_row_id;
  for (const c of o.categories ?? [])
    await db
      .prepare(
        'INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to) VALUES (?, ?, ?, ?)',
      )
      .bind(id, c, o.price?.[0] ?? null, o.price?.[1] ?? null)
      .run();
  for (const a of o.areas ?? [])
    await db
      .prepare(
        "INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, 'serves')",
      )
      .bind(id, a)
      .run();
  if (o.photo) {
    const key = unique().toString(16).padStart(32, '0');
    const img = (
      await db
        .prepare(
          'INSERT INTO portfolio_image (tailor_id, file_key, alt_text, permission_granted, is_visible) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(id, key, o.photo.alt, o.photo.permission, o.photo.visible)
        .run()
    ).meta.last_row_id;
    await db
      .prepare('UPDATE tailor SET profile_photo_id = ? WHERE id = ?')
      .bind(img, id)
      .run();
  }
  return {
    id,
    slug: (await db
      .prepare('SELECT slug FROM tailor WHERE id = ?')
      .bind(id)
      .first<{ slug: string }>())!.slug,
  };
}
const cat = async (name: string, active = 1) => {
  const slug = `dc-${unique()}`;
  const id = (
    await db
      .prepare(
        'INSERT INTO garment_category (slug, name, is_active) VALUES (?, ?, ?)',
      )
      .bind(slug, name, active)
      .run()
  ).meta.last_row_id;
  return { id, slug };
};
const area = async (name: string) => {
  const slug = `da-${unique()}`;
  const id = (
    await db
      .prepare('INSERT INTO service_area (slug, name) VALUES (?, ?)')
      .bind(slug, name)
      .run()
  ).meta.last_row_id;
  return { id, slug };
};
const page = async (path: string) => {
  const response = await get(path);
  return { status: response.status, html: await response.text() };
};

describe('directory (AC-02, FR-DIR-01..04)', () => {
  it('lists published tailors with the card facts, and never drafts or unpublished ones', async () => {
    const suits = await cat('Dir Suits Fake');
    const comoro = await area('Dir Comoro Fake');
    await tailor({
      name: 'Dir Visible Fake',
      home: 'yes',
      categories: [suits.id],
      areas: [comoro.id],
      price: [2000, 3550],
    });
    await tailor({
      name: 'Dir Hidden Draft Fake',
      published: false,
      categories: [suits.id],
    });
    const { status, html } = await page('/tailors');
    expect(status).toBe(200);
    expect(html).toContain('Dir Visible Fake');
    expect(html).toContain('Dir Suits Fake');
    expect(html).toContain('Dir Comoro Fake');
    expect(html).toContain('Home visits offered');
    expect(html).toContain('Approximate prices: $20 – $35.50');
    expect(html).not.toContain('Dir Hidden Draft Fake');
    expect(html).toMatch(
      /<h3 class="card__title"><a href="\/tailors\/dir-\d+">Dir Visible Fake<\/a><\/h3>/,
    );
  });

  it('shows the home-visit flag only for tailors who offer it, never "no" or "unknown" as a claim', async () => {
    await tailor({ name: 'Dir Home Yes Fake', home: 'yes' });
    await tailor({ name: 'Dir Home No Fake', home: 'no' });
    await tailor({ name: 'Dir Home Unknown Fake', home: 'unknown' });
    const { html } = await page('/tailors');
    const card = (name: string) =>
      html.slice(
        html.indexOf(name),
        html.indexOf('</article>', html.indexOf(name)),
      );
    expect(card('Dir Home Yes Fake')).toContain('Home visits offered');
    expect(card('Dir Home No Fake')).not.toContain('Home visits');
    expect(card('Dir Home Unknown Fake')).not.toContain('Home visits');
  });

  it('shows the disclaimer and the request button, in both languages (FR-PUB-02/03)', async () => {
    for (const [path, disclaimer, cta, request] of [
      [
        '/tailors',
        'introduces you to independent tailors',
        'Request a tailor at home',
        'href="/request"',
      ],
      [
        '/tet/tailors',
        'aprezenta ita ba alfaiate independente',
        'Husu alfaiate ba uma',
        'href="/tet/request"',
      ],
    ] as const) {
      const { html } = await page(path);
      expect(html, path).toContain(disclaimer);
      expect(html, path).toContain(cta);
      expect(html, path).toContain(request);
    }
  });

  it('is sorted alphabetically, ignoring case', async () => {
    await tailor({ name: 'dir zeta order Fake' });
    await tailor({ name: 'Dir Alpha order Fake' });
    await tailor({ name: 'DIR mid order Fake' });
    const { html } = await page('/tailors');
    const order = [...html.matchAll(/>(\w+ \w+ order Fake)</g)].map(
      (m) => m[1],
    );
    expect(order).toEqual([
      'Dir Alpha order Fake',
      'DIR mid order Fake',
      'dir zeta order Fake',
    ]);
  });

  it('filters by category, area and home visits, alone and combined, over plain GET links', async () => {
    const [c1, c2] = [
      await cat('Dir Filter Cat One Fake'),
      await cat('Dir Filter Cat Two Fake'),
    ];
    const [a1, a2] = [
      await area('Dir Filter Area One Fake'),
      await area('Dir Filter Area Two Fake'),
    ];
    await tailor({
      name: 'Dir F1 Fake',
      home: 'yes',
      categories: [c1.id],
      areas: [a1.id],
    });
    await tailor({
      name: 'Dir F2 Fake',
      home: 'no',
      categories: [c1.id],
      areas: [a2.id],
    });
    await tailor({
      name: 'Dir F3 Fake',
      home: 'yes',
      categories: [c2.id],
      areas: [a1.id],
    });
    const found = async (q: string) =>
      [...(await page(`/tailors${q}`)).html.matchAll(/>(Dir F\d Fake)</g)].map(
        (m) => m[1],
      );
    expect(await found(`?category=${c1.slug}`)).toEqual([
      'Dir F1 Fake',
      'Dir F2 Fake',
    ]);
    expect(await found(`?area=${a1.slug}`)).toEqual([
      'Dir F1 Fake',
      'Dir F3 Fake',
    ]);
    expect(await found('?home_visit=1')).toEqual(
      expect.arrayContaining(['Dir F1 Fake', 'Dir F3 Fake']),
    );
    expect(await found('?home_visit=1')).not.toContain('Dir F2 Fake');
    expect(await found(`?category=${c1.slug}&area=${a1.slug}`)).toEqual([
      'Dir F1 Fake',
    ]);
    expect(
      await found(`?category=${c1.slug}&area=${a2.slug}&home_visit=1`),
    ).toEqual([]);
    expect(
      await found(`?category=${c2.slug}&area=${a1.slug}&home_visit=1`),
    ).toEqual(['Dir F3 Fake']);
  });

  it('keeps the chosen filters selected in the form, and the form is plain HTML with labelled fields', async () => {
    const c = await cat('Dir Selected Cat Fake');
    await tailor({ name: 'Dir Sel Fake', categories: [c.id] });
    const { html } = await page(`/tailors?category=${c.slug}&home_visit=1`);
    expect(html).toContain(
      '<form class="filters" method="get" action="/tailors">',
    );
    expect(html).toContain('<label for="filter-category">');
    expect(html).toMatch(new RegExp(`<option value="${c.slug}" selected`));
    expect(html).toMatch(/name="home_visit" value="1" checked/);
    expect(html).not.toMatch(/<script/);
  });

  it('marks filtered pages noindex with the plain list as canonical, but not the plain list', async () => {
    const plain = (await page('/tailors')).html;
    expect(plain).not.toContain('name="robots"');
    expect(plain).toContain(
      '<link rel="canonical" href="https://alfaiate-tl.example/tailors"',
    );
    const filtered = (await page('/tailors?home_visit=1')).html;
    expect(filtered).toContain('name="robots" content="noindex,follow"');
    expect(filtered).toContain(
      '<link rel="canonical" href="https://alfaiate-tl.example/tailors"',
    );
    expect(filtered).toContain(
      'hreflang="tet" href="https://alfaiate-tl.example/tet/tailors"',
    );
  });

  it('offers a way out when nothing matches: clear filters and the request button (FR-DIR-04)', async () => {
    const c = await cat('Dir Lonely Cat Fake');
    const { status, html } = await page(
      `/tailors?category=${c.slug}&home_visit=1`,
    );
    expect(status).toBe(200);
    expect(html).toContain('No tailors match');
    expect(html).toContain('Tailors found: 0');
    expect(html).toContain('Clear filters');
    expect(html).toContain('href="/request"');
  });

  it('ignores hostile filter values: no error, nothing reflected, no filtering', async () => {
    for (const q of [
      "?category=a'%20OR%201=1%20--",
      '?area=%3Cscript%3Ealert(1)%3C/script%3E',
      '?category=../../etc/passwd&home_visit=<b>',
      `?category=${'a'.repeat(5000)}`,
    ]) {
      const { status, html } = await page(`/tailors${q}`);
      expect(status, q).toBe(200);
      expect(html, q).not.toContain('<script>alert');
      expect(html, q).not.toContain('OR 1=1');
      expect(html, q).not.toContain('etc/passwd');
    }
  });

  it('shows a profile photo only while it is permitted and visible', async () => {
    await tailor({
      name: 'Dir Photo Yes Fake',
      photo: { permission: 1, visible: 1, alt: 'Dir Permitted Alt' },
    });
    await tailor({
      name: 'Dir Photo No Fake',
      photo: { permission: 0, visible: 1, alt: 'Dir Unpermitted Alt' },
    });
    await tailor({
      name: 'Dir Photo Hidden Fake',
      photo: { permission: 1, visible: 0, alt: 'Dir Hidden Alt' },
    });
    const { html } = await page('/tailors');
    expect(html).toContain('alt="Dir Permitted Alt"');
    expect(html).toContain('/medium.jpg');
    expect(html).not.toContain('Dir Unpermitted Alt');
    expect(html).not.toContain('Dir Hidden Alt');
  });

  it('works the same in Tetum', async () => {
    const c = await cat('Dir Tetum Cat Fake');
    await tailor({ name: 'Dir Tetum Fake', categories: [c.id] });
    const { status, html } = await page(`/tet/tailors?category=${c.slug}`);
    expect(status).toBe(200);
    expect(html).toContain('<html lang="tet">');
    expect(html).toContain('Dir Tetum Fake');
    expect(html).toContain('Alfaiate hetan: 1');
    expect(html).toContain('action="/tet/tailors"');
    expect(html).toContain('href="/tet/tailors/dir-');
  });

  it('keeps hostile names inert and the page free of inline script and style', async () => {
    await tailor({ name: '"><img src=x onerror=alert(1)>' });
    const { html } = await page('/tailors');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<style');
    expect(html).not.toMatch(/<script(?![^>]*src=)/);
    expect(html).not.toMatch(/\sstyle="/);
  });
});

describe('category pages (FR-PUB-04)', () => {
  it('list the published tailors of an active category, with the request button and the disclaimer', async () => {
    const c = await cat('Dir Page Cat Fake');
    await tailor({ name: 'Dir Cat Member Fake', categories: [c.id] });
    await tailor({
      name: 'Dir Cat Draft Fake',
      published: false,
      categories: [c.id],
    });
    await tailor({ name: 'Dir Cat Other Fake' });
    const { status, html } = await page(`/categories/${c.slug}`);
    expect(status).toBe(200);
    expect(html).toContain('<h1>Dir Page Cat Fake</h1>');
    expect(html).toContain('Dir Cat Member Fake');
    expect(html).not.toContain('Dir Cat Draft Fake');
    expect(html).not.toContain('Dir Cat Other Fake');
    expect(html).toContain('introduces you to independent tailors');
    expect(html).toContain('href="/request"');
    expect(html).toContain(
      `<link rel="canonical" href="https://alfaiate-tl.example/categories/${c.slug}"`,
    );
    expect(html).toContain(`href="/tailors?category=${c.slug}"`);
  });

  it('answer 404 with the site 404 page for unknown, inactive or malformed categories', async () => {
    const off = await cat('Dir Inactive Cat Fake', 0);
    for (const path of [
      '/categories/no-such-category',
      `/categories/${off.slug}`,
      '/categories/%3Cscript%3E',
      '/categories/Has%20Space',
      `/categories/${'a'.repeat(300)}`,
      '/tet/categories/no-such-category',
    ]) {
      const { status, html } = await page(path);
      expect(status, path).toBe(404);
      expect(html, path).toMatch(/We could not find that page|Ami la hetan/);
      expect(html, path).not.toContain('<script>alert');
    }
  });

  it('exist in Tetum too, with a Tetum twin link', async () => {
    const c = await cat('Dir Tetum Page Cat Fake');
    await tailor({ name: 'Dir Tetum Cat Member Fake', categories: [c.id] });
    const { status, html } = await page(`/tet/categories/${c.slug}`);
    expect(status).toBe(200);
    expect(html).toContain('<html lang="tet">');
    expect(html).toContain('Dir Tetum Cat Member Fake');
    expect(html).toContain(`href="/categories/${c.slug}" lang="en"`);
  });
});
