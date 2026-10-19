import { describe, expect, it } from 'vitest';
import { get, unique } from '../integration/helpers';
import { env } from 'cloudflare:workers';

// This project runs the built worker with SITE_INDEXABLE=false (staging): nothing may be offered to search engines.
describe('staging mode: SITE_INDEXABLE is off', () => {
  it('robots.txt disallows everything and names no sitemap', async () => {
    const text = await (await get('/robots.txt')).text();
    expect(text).toContain('Disallow: /');
    expect(text).not.toContain('Sitemap:');
  });

  it('the sitemap is empty even with a published tailor', async () => {
    const slug = `ni-${unique()}`;
    await env.DB.prepare(
      "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES (?, 'Staging Fake', 'approved', 1, 1, 1, '+67033123456')",
    )
      .bind(slug)
      .run();
    const xml = await (await get('/sitemap.xml')).text();
    expect(xml).toContain('<urlset');
    expect(xml).not.toContain('<url>');
    expect(xml).not.toContain(slug);
  });

  it('every kind of response says noindex in the header, and pages also in the meta tag', async () => {
    for (const path of [
      '/',
      '/tailors',
      '/how-it-works',
      '/request',
      '/no-such-page',
      '/robots.txt',
      '/sitemap.xml',
      '/media/' + 'a'.repeat(32) + '/thumb.jpg',
    ]) {
      const response = await get(path);
      expect(response.headers.get('x-robots-tag'), path).toBe(
        'noindex, nofollow',
      );
    }
    for (const path of ['/', '/tailors', '/request', '/no-such-page']) {
      const html = await (await get(path)).text();
      expect(html, path).toContain('name="robots" content="noindex,nofollow"');
    }
  });
});
