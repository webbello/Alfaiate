import { describe, expect, it } from 'vitest';

// Scope guard for the public site: a page that is not planned cannot appear unnoticed.
const files = Object.keys(import.meta.glob('../../src/pages/**/*.{astro,ts}'))
  .map((p) => p.split('/src/pages/')[1])
  .filter((p) => !p.startsWith('admin/') && !p.startsWith('portal/')) // the tailor portal is private: see portal-route-inventory.test.ts
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
    'api/contact-click.ts',
    'areas/[slug].astro',
    'business.astro',
    'categories/[slug].astro',
    'contact.astro',
    'craft.astro',
    'faq.astro',
    'gallery.astro',
    'how-it-works.astro',
    'index.astro',
    'join.astro',
    'join/thanks.astro',
    'journal/[slug].astro',
    'journal/category/[slug].astro',
    'journal/index.astro',
    'media/[...key].ts',
    'media/shop/[...key].ts',
    'newsletter.astro',
    'newsletter/thanks.astro',
    'privacy.astro',
    'request.astro',
    'request/thanks.astro',
    'robots.txt.ts',
    'rss.xml.ts',
    'services.astro',
    'sitemap-[n].xml.ts',
    'sitemap.xml.ts',
    'tailors/[slug].astro',
    'tailors/index.astro',
    'terms.astro',
    'tet/about.astro',
    'tet/areas/[slug].astro',
    'tet/business.astro',
    'tet/categories/[slug].astro',
    'tet/contact.astro',
    'tet/craft.astro',
    'tet/faq.astro',
    'tet/gallery.astro',
    'tet/how-it-works.astro',
    'tet/index.astro',
    'tet/join.astro',
    'tet/join/thanks.astro',
    'tet/journal/[slug].astro',
    'tet/journal/category/[slug].astro',
    'tet/journal/index.astro',
    'tet/newsletter.astro',
    'tet/newsletter/thanks.astro',
    'tet/privacy.astro',
    'tet/request.astro',
    'tet/request/thanks.astro',
    'tet/services.astro',
    'tet/tailors/[slug].astro',
    'tet/tailors/index.astro',
    'tet/terms.astro',
  ];

  it('are exactly the expected public pages', () => {
    expect(files).toEqual(EXPECTED);
  });
});
