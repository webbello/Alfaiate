import { describe, expect, it } from 'vitest';

// Scope guard for the public site: a page that is not planned cannot appear unnoticed.
const files = Object.keys(import.meta.glob('../../src/pages/**/*.{astro,ts}'))
  .map((p) => p.split('/src/pages/')[1])
  .filter((p) => !p.startsWith('admin/'))
  .sort();

describe('public routes (scope guard)', () => {
  it('has a Tetum twin for every English page (the image route and the 404 page are language-neutral)', () => {
    const english = files.filter(
      (f) =>
        !f.startsWith('tet/') &&
        f !== '404.astro' &&
        !f.startsWith('media/') &&
        !f.startsWith('api/') &&
        !f.endsWith('.xml.ts') &&
        !f.endsWith('.txt.ts'),
    );
    for (const page of english) expect(files, page).toContain(`tet/${page}`);
  });

  // Every public page is listed here on purpose. Adding a page means adding it here, in both languages.
  const EXPECTED = [
    '404.astro',
    'about.astro',
    'categories/[slug].astro',
    'how-it-works.astro',
    'index.astro',
    'media/[...key].ts',
    'privacy.astro',
    'request.astro',
    'robots.txt.ts',
    'sitemap.xml.ts',
    'tailors/[slug].astro',
    'tailors/index.astro',
    'terms.astro',
    'tet/about.astro',
    'tet/categories/[slug].astro',
    'tet/how-it-works.astro',
    'tet/index.astro',
    'tet/privacy.astro',
    'tet/request.astro',
    'tet/tailors/[slug].astro',
    'tet/tailors/index.astro',
    'tet/terms.astro',
  ];

  it('are exactly the expected public pages', () => {
    expect(files).toEqual(EXPECTED);
  });
});
