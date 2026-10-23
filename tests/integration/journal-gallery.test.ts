import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// Handspark theme step 6: journal, gallery and FAQ. No invented content (BR-11), only permitted photos (BR-06), noindex until the owner approves the text.
const db = env.DB;
const addTailor = async (name: string, published = 1) => {
  const slug = `jg-${unique()}`;
  const id = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded) VALUES (?, ?, 'approved', ?, ?)",
      )
      .bind(slug, name, published, published)
      .run()
  ).meta.last_row_id as number;
  return { slug, id };
};
const addPhoto = async (
  tailorId: number,
  alt: string,
  permission = 1,
  visible = 1,
) =>
  db
    .prepare(
      'INSERT INTO portfolio_image (tailor_id, file_key, alt_text, permission_granted, is_visible) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(tailorId, `key-${unique()}`, alt, permission, visible)
    .run();

describe('journal', () => {
  it('is empty and noindex with no samples, in both languages, and has no article addresses', async () => {
    for (const [path, empty] of [
      ['/journal', 'No articles yet'],
      ['/tet/journal', 'Seidauk iha artigu'],
      ['/journal/category/tips', 'No articles yet'],
    ] as const) {
      const response = await get(path);
      const html = await response.text();
      expect(response.status, path).toBe(200);
      expect(html, path).toContain(empty);
      expect(html, path).toContain('name="robots" content="noindex,follow"');
      expect(html, path).not.toContain('Sample');
    }
    expect((await get('/journal/sample-measurements')).status).toBe(404);
    expect((await get('/journal/category/no-such')).status).toBe(404);
  });
  it('serves a feed with no items, and keeps journal, gallery and FAQ out of the sitemap until approved', async () => {
    const feed = await get('/rss.xml');
    expect(feed.status).toBe(200);
    expect(feed.headers.get('content-type')).toContain('application/rss+xml');
    expect(await feed.text()).not.toContain('<item>');
    const sitemap = await (await get('/sitemap.xml')).text();
    for (const p of ['/journal', '/gallery', '/faq'])
      expect(sitemap).not.toContain(p);
  });
});

describe('gallery', () => {
  it('shows only photos with recorded permission, visible, from published tailors, each linking to its tailor', async () => {
    const ok = await addTailor('Jg Shown Fake');
    const draft = await addTailor('Jg Draft Fake', 0);
    await addPhoto(ok.id, 'Jg permitted alt');
    await addPhoto(ok.id, 'Jg no permission alt', 0, 1);
    await addPhoto(ok.id, 'Jg hidden alt', 1, 0);
    await addPhoto(draft.id, 'Jg draft tailor alt');
    const html = await (await get('/gallery')).text();
    expect(html).toContain('alt="Jg permitted alt"');
    expect(html).not.toContain('Jg no permission alt');
    expect(html).not.toContain('Jg hidden alt');
    expect(html).not.toContain('Jg draft tailor alt');
    expect(html).toContain(`href="/tailors/${ok.slug}"`);
    expect(html).toMatch(/data-lightbox[^>]*aria-label="View Jg Shown Fake/);
    expect(html).toContain('name="robots" content="noindex,follow"');
    expect(await (await get('/tet/gallery')).text()).toContain(
      '<html lang="tet">',
    );
  });
});

describe('FAQ page', () => {
  it('is an accordion of the four questions with labelled buttons, and links to the request form', async () => {
    const html = await (await get('/faq')).text();
    expect(html.match(/data-accordion-trigger/g)).toHaveLength(4);
    expect(html.match(/aria-expanded="false"/g)!.length).toBeGreaterThanOrEqual(
      4,
    );
    expect(html).toContain('Who sets the price?');
    expect(html).toContain('href="/request"');
    expect(await (await get('/tet/faq')).text()).toContain('Pergunta sira');
  });
  it('is linked from the menu and the footer', async () => {
    const html = await (await get('/')).text();
    expect(html).toContain('href="/faq"');
    expect(html).toContain('href="/journal"');
    expect(html).toContain('href="/gallery"');
  });
});
