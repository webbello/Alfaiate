import { describe, expect, it } from 'vitest';
import { buildRobots, buildSitemap } from '../../src/modules/seo/sitemap';

const base = {
  siteUrl: 'https://alfaiate-tl.example',
  languages: ['en', 'tet'] as ('en' | 'tet')[],
};

describe('buildSitemap', () => {
  it('lists each page once per enabled language, each with alternates for all of them and x-default', () => {
    const xml = buildSitemap({ ...base, paths: ['/', '/tailors/ana'] });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    );
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml.match(/<url>/g)).toHaveLength(4);
    expect(xml).toContain('<loc>https://alfaiate-tl.example/</loc>');
    expect(xml).toContain('<loc>https://alfaiate-tl.example/tet/</loc>');
    expect(xml).toContain('<loc>https://alfaiate-tl.example/tailors/ana</loc>');
    expect(xml).toContain(
      '<loc>https://alfaiate-tl.example/tet/tailors/ana</loc>',
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="tet" href="https://alfaiate-tl.example/tet/tailors/ana"/>',
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://alfaiate-tl.example/tailors/ana"/>',
    );
  });

  it('has no Tetum address and no Tetum alternate while Tetum is off', () => {
    const xml = buildSitemap({
      ...base,
      languages: ['en'],
      paths: ['/', '/tailors'],
    });
    expect(xml).not.toContain('/tet');
    expect(xml).not.toContain('hreflang="tet"');
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  it('escapes anything that is not safe in XML, and drops paths that are not paths', () => {
    const xml = buildSitemap({
      ...base,
      paths: ['/a&b<c>"d\'', 'no-slash', '//evil.test', '/ok'],
    });
    expect(xml).toContain('/a&amp;b&lt;c&gt;&quot;d&apos;');
    expect(xml).not.toContain('no-slash');
    expect(xml).not.toContain('evil.test');
    expect(xml).toContain('/ok');
  });

  it('is a valid empty sitemap when there are no pages', () => {
    expect(buildSitemap({ ...base, paths: [] })).toContain('<urlset');
  });
});

describe('buildRobots', () => {
  it('blocks the admin and API areas and names the sitemap', () => {
    const text = buildRobots('https://alfaiate-tl.example');
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Disallow: /admin');
    expect(text).toContain('Disallow: /api');
    expect(text).toContain('Sitemap: https://alfaiate-tl.example/sitemap.xml');
    expect(text).not.toMatch(/Allow: \/admin/);
  });
});
