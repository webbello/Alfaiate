import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

const db = env.DB;
const seedTailor = async (name: string, published: boolean) => {
  const slug = `seo-${unique()}`;
  const id = (
    await db
      .prepare(
        'INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(
        slug,
        name,
        published ? 'approved' : 'draft',
        published ? 1 : 0,
        published ? 1 : 0,
      )
      .run()
  ).meta.last_row_id;
  return { id, slug };
};
const seedCategory = async (name: string, tailorId?: number) => {
  const slug = `seo-cat-${unique()}`;
  const id = (
    await db
      .prepare('INSERT INTO garment_category (slug, name) VALUES (?, ?)')
      .bind(slug, name)
      .run()
  ).meta.last_row_id;
  if (tailorId)
    await db
      .prepare(
        'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
      )
      .bind(tailorId, id)
      .run();
  return { id, slug };
};
const sitemap = async () => {
  const response = await get('/sitemap.xml');
  return { response, xml: await response.text() };
};

describe('sitemap.xml (NFR-SEO-01, AC-05)', () => {
  it('is XML and lists the home page, the directory and published content in both languages with alternates', async () => {
    const live = await seedTailor('Seo Live Fake', true);
    const cat = await seedCategory('Seo Cat Fake', live.id);
    const { response, xml } = await sitemap();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/xml');
    for (const path of [
      '/',
      '/tailors',
      `/tailors/${live.slug}`,
      `/categories/${cat.slug}`,
    ]) {
      expect(xml, path).toContain(
        `<loc>https://alfaiate-tl.example${path}</loc>`,
      );
      expect(xml, path).toContain(
        `<loc>https://alfaiate-tl.example/tet${path === '/' ? '/' : path}</loc>`,
      );
    }
    expect(xml).toContain(
      `hreflang="tet" href="https://alfaiate-tl.example/tet/tailors/${live.slug}"`,
    );
    expect(xml).toContain('hreflang="x-default"');
  });

  it('leaves out draft and unpublished tailors, categories without a published tailor, the request placeholder and unapproved static pages', async () => {
    const draft = await seedTailor('Seo Draft Fake', false);
    const empty = await seedCategory('Seo Empty Cat Fake');
    const draftCat = await seedCategory('Seo Draft Cat Fake', draft.id);
    const { xml } = await sitemap();
    expect(xml).not.toContain(draft.slug);
    expect(xml).not.toContain(empty.slug);
    expect(xml).not.toContain(draftCat.slug);
    for (const hidden of [
      '/request',
      '/privacy',
      '/terms',
      '/how-it-works',
      '/about',
      '/admin',
      '/api',
    ])
      expect(xml, hidden).not.toContain(`example${hidden}<`);
  });

  it('stops listing a tailor as soon as it is unpublished (AC-05)', async () => {
    const t = await seedTailor('Seo Toggle Fake', true);
    expect((await sitemap()).xml).toContain(t.slug);
    await db
      .prepare('UPDATE tailor SET is_published = 0 WHERE id = ?')
      .bind(t.id)
      .run();
    expect((await sitemap()).xml).not.toContain(t.slug);
  });

  it('only contains addresses on the configured site URL', async () => {
    const { xml } = await sitemap();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(2);
    for (const loc of locs)
      expect(loc.startsWith('https://alfaiate-tl.example/'), loc).toBe(true);
  });

  it('carries the usual security headers and sets no cookie', async () => {
    const { response } = await sitemap();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});

describe('robots.txt', () => {
  it('blocks the admin and API areas, allows the rest and points at the sitemap', async () => {
    const response = await get('/robots.txt');
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(text).toContain('Disallow: /admin');
    expect(text).toContain('Disallow: /api');
    expect(text).toContain('Sitemap: https://alfaiate-tl.example/sitemap.xml');
    expect(text).not.toMatch(/Disallow: \/\s*$/m);
  });
});

describe('production mode: SITE_INDEXABLE is "true"', () => {
  it('public pages carry no X-Robots-Tag and robots.txt offers the sitemap', async () => {
    for (const path of ['/', '/tailors', '/how-it-works'])
      expect((await get(path)).headers.get('x-robots-tag'), path).toBeNull();
    const robots = await (await get('/robots.txt')).text();
    expect(robots).toContain(
      'Sitemap: https://alfaiate-tl.example/sitemap.xml',
    );
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });
});
