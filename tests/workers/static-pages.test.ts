import { describe, expect, it } from 'vitest';
import {
  STATIC_PAGES,
  indexableStaticSlugs,
  isIndexable,
  staticPage,
} from '../../src/modules/seo/pages';
import { en } from '../../src/i18n/public/en';
import { tet } from '../../src/i18n/public/tet';

describe('static page registry', () => {
  it('lists the four pages and knows nothing else', () => {
    expect(STATIC_PAGES.map((p) => p.slug).sort()).toEqual([
      'about',
      'how-it-works',
      'privacy',
      'terms',
    ]);
    expect(staticPage('admin')).toBeUndefined();
    expect(isIndexable('admin')).toBe(false);
  });

  it('keeps unreviewed pages out of search and the sitemap', () => {
    for (const page of STATIC_PAGES)
      expect(isIndexable(page.slug)).toBe(page.reviewed);
    expect(indexableStaticSlugs()).toEqual(
      STATIC_PAGES.filter((p) => p.reviewed).map((p) => p.slug),
    );
  });

  it('never marks a placeholder page as reviewed (OQ-08): privacy and terms stay unindexed while their text is a placeholder', () => {
    for (const slug of ['privacy', 'terms'] as const) {
      const text = {
        privacy: [en.pages.privacy.intro, tet.pages.privacy.intro],
        terms: [en.pages.terms.intro, tet.pages.terms.intro],
      }[slug];
      if (/placeholder|fatin-reservadu/i.test(text.join(' ')))
        expect(isIndexable(slug), slug).toBe(false);
    }
  });
});
