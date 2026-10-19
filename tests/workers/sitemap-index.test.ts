import { describe, expect, it } from 'vitest';
import { SITEMAP_LIMIT, sitemapPlan } from '../../src/modules/seo/sitemap';

// A sitemap file holds at most 5,000 entries (one per page and language); more becomes an index with child files.
const paths = (n: number) =>
  Array.from({ length: n }, (_, i) => `/tailors/t${i}`);
const entries = (xml: string) => (xml.match(/<url>/g) ?? []).length;
const plan = (n: number, languages: ('en' | 'tet')[] = ['en']) =>
  sitemapPlan({ siteUrl: 'https://example.test', languages, paths: paths(n) });

describe('sitemapPlan', () => {
  it('stays one file up to exactly the limit', () => {
    expect(SITEMAP_LIMIT).toBe(5000);
    const p = plan(5000);
    expect(p).toHaveProperty('single');
    expect(entries((p as { single: string }).single)).toBe(5000);
  });

  it('becomes an index with child files just past the limit, every page exactly once', () => {
    const p = plan(5001) as { index: string; children: string[] };
    expect(p.children).toHaveLength(2);
    expect(p.index).toContain('<sitemapindex');
    expect(p.index).toContain('<loc>https://example.test/sitemap-1.xml</loc>');
    expect(p.index).toContain('<loc>https://example.test/sitemap-2.xml</loc>');
    expect(p.index).not.toContain('sitemap-3.xml');
    expect(p.children.map(entries)).toEqual([5000, 1]);
    const all = p.children.join('');
    for (const i of [0, 4999, 5000])
      expect(all.match(new RegExp(`/tailors/t${i}</loc>`, 'g'))).toHaveLength(
        1,
      );
  });

  it('counts a page once per enabled language and keeps both languages of a page in the same file', () => {
    const p = plan(2600, ['en', 'tet']) as { children: string[] };
    expect(p.children).toHaveLength(2);
    expect(p.children.map(entries)).toEqual([5000, 200]);
    for (const child of p.children) {
      const en = (child.match(/<loc>https:\/\/example\.test\/tailors\//g) ?? [])
        .length;
      const tet = (
        child.match(/<loc>https:\/\/example\.test\/tet\/tailors\//g) ?? []
      ).length;
      expect(en).toBe(tet);
    }
  });

  it('is an empty urlset for no pages', () => {
    const p = plan(0) as { single: string };
    expect(p.single).toContain('<urlset');
    expect(entries(p.single)).toBe(0);
  });
});
