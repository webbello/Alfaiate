import { describe, expect, it } from 'vitest';
import { buildHead } from '../../src/modules/seo/head';

const base = {
  siteUrl: 'https://alfaiate-tl.example',
  languages: ['en', 'tet'] as ('en' | 'tet')[],
};

describe('buildHead', () => {
  it('gives a canonical URL from the site URL and the language, plus alternates for every enabled language', () => {
    const head = buildHead({ ...base, lang: 'tet', rest: '/tailors/ana' });
    expect(head.canonical).toBe('https://alfaiate-tl.example/tet/tailors/ana');
    expect(head.alternates).toEqual([
      { hreflang: 'en', href: 'https://alfaiate-tl.example/tailors/ana' },
      { hreflang: 'tet', href: 'https://alfaiate-tl.example/tet/tailors/ana' },
      {
        hreflang: 'x-default',
        href: 'https://alfaiate-tl.example/tailors/ana',
      },
    ]);
    expect(head.robots).toBeNull();
  });

  it('offers no Tetum alternate while Tetum is off', () => {
    const head = buildHead({
      ...base,
      languages: ['en'],
      lang: 'en',
      rest: '/',
    });
    expect(head.alternates.map((a) => a.hreflang)).toEqual(['en', 'x-default']);
    expect(head.canonical).toBe('https://alfaiate-tl.example/');
  });

  it('can mark a page noindex and use another canonical path (filtered pages point at the plain list)', () => {
    const head = buildHead({
      ...base,
      lang: 'en',
      rest: '/tailors',
      noindex: true,
      canonicalRest: '/tailors',
    });
    expect(head.robots).toBe('noindex,follow');
    const admin = buildHead({
      ...base,
      lang: 'en',
      rest: '/x',
      noindex: 'nofollow',
    });
    expect(admin.robots).toBe('noindex,nofollow');
  });

  it('omits canonical and alternates for pages that are not real pages (404)', () => {
    const head = buildHead({
      ...base,
      lang: 'en',
      rest: '/nope',
      canonical: false,
      noindex: true,
    });
    expect(head.canonical).toBeNull();
    expect(head.alternates).toEqual([]);
  });

  it('never lets a query string or fragment into the canonical', () => {
    expect(
      buildHead({ ...base, lang: 'en', rest: '/tailors?category=x#top' })
        .canonical,
    ).toBe('https://alfaiate-tl.example/tailors');
  });
});
