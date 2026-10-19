import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, get, unique } from './helpers';
import { worker } from './worker';

const db = env.DB;

describe('a malformed stored number does not take the profile down (carried over from the Phase 4 audit)', () => {
  it('renders the page without the broken button and keeps the other one', async () => {
    const slug = `hd-${unique()}`;
    // '+12345+78' passes the database shape check (digits and plus signs) but is not a valid number for a link
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164, phone_e164) VALUES (?, 'Broken Number Fake', 'approved', 1, 1, 1, '+12345+78', '+67033123456')",
      )
      .bind(slug)
      .run();
    const response = await get(`/tailors/${slug}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Broken Number Fake');
    expect(html).not.toContain('wa.me');
    expect(html).toContain('href="tel:+67033123456"');
  });

  it('renders with no contact buttons at all when both numbers are broken', async () => {
    const slug = `hd-${unique()}`;
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164, phone_e164) VALUES (?, 'Both Broken Fake', 'approved', 1, 1, 1, '+12345+78', '+98765+43')",
      )
      .bind(slug)
      .run();
    const response = await get(`/tailors/${slug}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).not.toContain('wa.me');
    expect(html).not.toContain('href="tel:');
    expect(html).toContain('/request?tailor=' + slug);
  });
});

describe('a request post without an Origin header shows a plain page, not a bare "Forbidden"', () => {
  // Privacy-stripped browsers can send no Origin. A post from another site is refused earlier by Astro's own cross-site check (403, plain text).
  const post = (path: string, origin: string | null) =>
    worker.fetch(
      new Request(`${ORIGIN}${path}`, {
        method: 'POST',
        headers: {
          ...(origin ? { Origin: origin } : {}),
          'content-type': 'application/x-www-form-urlencoded',
          'cf-connecting-ip': `198.51.100.${unique() % 250}`,
        },
        body: 'name=x',
      }),
    );

  it('in English and in Tetum, with status 403, no cookie, no indexing and a way back', async () => {
    const en = await post('/request', null);
    const html = await en.text();
    expect(en.status).toBe(403);
    expect(html).toContain('We could not send your request');
    expect(html).toContain('<h1>');
    expect(html).toContain('name="robots"');
    expect(html).toContain('href="/request"');
    expect(en.headers.get('set-cookie')).toBeNull();
    const tet = await post('/tet/request', null);
    expect(tet.status).toBe(403);
    const tetHtml = await tet.text();
    expect(tetHtml).toContain('<html lang="tet">');
    expect(tetHtml).toContain('href="/tet/request"');
  });

  it('still refuses a post from another site, and stores nothing', async () => {
    const before = (await db
      .prepare('SELECT count(*) AS c FROM enquiry')
      .first<{ c: number }>())!.c;
    expect((await post('/request', 'https://evil.test')).status).toBe(403);
    expect(
      (await db
        .prepare('SELECT count(*) AS c FROM enquiry')
        .first<{ c: number }>())!.c,
    ).toBe(before);
  });
});

describe('the sitemap index (served only when there are many pages)', () => {
  it('serves the normal sitemap for a small site and 404 for a child file that does not exist', async () => {
    const xml = await (await get('/sitemap.xml')).text();
    expect(xml).toContain('<urlset');
    expect((await get('/sitemap.xml')).headers.get('cache-control')).toBe(
      'public, max-age=3600',
    );
    for (const path of [
      '/sitemap-1.xml',
      '/sitemap-2.xml',
      '/sitemap-abc.xml',
      '/sitemap-0.xml',
    ])
      expect((await get(path)).status, path).toBe(404);
  });
});

describe('the sitemap index with many tailors', () => {
  it('becomes an index with child files, each a valid sitemap, once there are more than 5,000 pages', async () => {
    await db
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 2600)
         INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164)
         SELECT 'bulk-' || i, 'Bulk ' || i, 'approved', 1, 1, 1, '+67033123456' FROM n`,
      )
      .run();
    const index = await (await get('/sitemap.xml')).text();
    expect(index).toContain('<sitemapindex');
    expect(index).toContain(
      '<loc>https://alfaiate-tl.example/sitemap-1.xml</loc>',
    );
    expect(index).toContain(
      '<loc>https://alfaiate-tl.example/sitemap-2.xml</loc>',
    );
    const [one, two] = [
      await get('/sitemap-1.xml'),
      await get('/sitemap-2.xml'),
    ];
    expect(one.status).toBe(200);
    expect(one.headers.get('content-type')).toContain('application/xml');
    const entries = (xml: string) => (xml.match(/<url>/g) ?? []).length;
    const [a, b] = [await one.text(), await two.text()];
    expect(entries(a)).toBe(5000);
    expect(entries(a) + entries(b)).toBeGreaterThan(5000);
    expect((await get('/sitemap-3.xml')).status).toBe(404);
    // every bulk tailor appears exactly once per language across the files
    expect(
      (a + b).match(
        /<loc>https:\/\/alfaiate-tl\.example\/tailors\/bulk-1<\/loc>/g,
      ),
    ).toHaveLength(1);
    expect(
      (a + b).match(
        /<loc>https:\/\/alfaiate-tl\.example\/tet\/tailors\/bulk-1<\/loc>/g,
      ),
    ).toHaveLength(1);
  });
});
