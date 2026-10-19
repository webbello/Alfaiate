import { describe, expect, it } from 'vitest';
import { isIndexable } from '../../src/modules/seo/indexable';
import { buildRobots, buildSitemap } from '../../src/modules/seo/sitemap';
import { buildHead } from '../../src/modules/seo/head';
import { applySecurityHeaders } from '../../src/modules/auth/headers';
import { siteConfig } from '../../src/modules/config';

// AC-05 for staging: a site that is not explicitly marked indexable must never be indexed.
describe('isIndexable', () => {
  it('is true only for the exact string "true"', () => {
    expect(isIndexable('true')).toBe(true);
    for (const value of [
      undefined,
      '',
      'TRUE',
      'True',
      '1',
      'yes',
      'false',
      ' true',
      'true ',
      'on',
      'enabled',
      'truee',
    ])
      expect(isIndexable(value), String(value)).toBe(false);
  });

  it('is part of the site configuration and defaults to off', () => {
    const base = { SITE_URL: 'https://example.test', PUBLIC_LANGUAGES: 'en' };
    expect(siteConfig(base).indexable).toBe(false);
    expect(siteConfig({ ...base, SITE_INDEXABLE: 'true' }).indexable).toBe(
      true,
    );
    expect(siteConfig({ ...base, SITE_INDEXABLE: 'nope' }).indexable).toBe(
      false,
    );
  });
});

describe('robots.txt', () => {
  it('disallows everything and lists no sitemap when not indexable', () => {
    const text = buildRobots('https://example.test', false);
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Disallow: /\n');
    expect(text).not.toContain('Sitemap:');
    expect(text).not.toContain('Disallow: /admin');
  });

  it('keeps the production rules when indexable', () => {
    const text = buildRobots('https://example.test', true);
    expect(text).toContain('Disallow: /admin');
    expect(text).toContain('Disallow: /api');
    expect(text).toContain('Sitemap: https://example.test/sitemap.xml');
    expect(text).not.toMatch(/^Disallow: \/$/m);
  });
});

describe('sitemap when not indexable', () => {
  it('is a valid empty urlset', () => {
    const xml = buildSitemap({
      siteUrl: 'https://example.test',
      languages: ['en'],
      paths: [],
    });
    expect(xml).toContain('<urlset');
    expect(xml).not.toContain('<url>');
  });
});

describe('page head when not indexable', () => {
  const input = {
    siteUrl: 'https://example.test',
    languages: ['en'] as const,
    lang: 'en' as const,
    rest: '/tailors',
  };
  it('forces noindex,nofollow even on a page that would be indexed', () => {
    expect(buildHead({ ...input, indexable: false }).robots).toBe(
      'noindex,nofollow',
    );
    expect(
      buildHead({ ...input, indexable: false, noindex: true }).robots,
    ).toBe('noindex,nofollow');
    expect(
      buildHead({ ...input, indexable: false, canonical: false }).robots,
    ).toBe('noindex,nofollow');
  });
  it('is unchanged when indexable', () => {
    expect(buildHead({ ...input, indexable: true }).robots).toBeNull();
    expect(buildHead({ ...input, indexable: true, noindex: true }).robots).toBe(
      'noindex,follow',
    );
  });
});

describe('X-Robots-Tag header', () => {
  const run = (path: string, indexable: boolean) =>
    applySecurityHeaders(new Response('x'), path, indexable).headers.get(
      'x-robots-tag',
    );
  it('is sent on every response when not indexable', () => {
    for (const path of [
      '/',
      '/tailors',
      '/media/abc',
      '/api/contact-click',
      '/robots.txt',
      '/sitemap.xml',
      '/admin',
    ])
      expect(run(path, false), path).toBe('noindex, nofollow');
  });
  it('is sent only for /admin when indexable', () => {
    expect(run('/admin/login', true)).toBe('noindex, nofollow');
    expect(run('/', true)).toBeNull();
    expect(run('/tailors/ana', true)).toBeNull();
  });
});
