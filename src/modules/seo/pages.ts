/**
 * The static pages and whether the owner has approved their text. An unreviewed page is served but marked noindex and kept out of
 * the sitemap. Flip `reviewed` to true only when the owner has approved that page's text (SPEC-phase-4 assumption 7).
 * Privacy and Terms stay false until the owner supplies the real text (OQ-08).
 */
export const STATIC_PAGES: readonly {
  slug: string;
  key: 'how' | 'about' | 'privacy' | 'terms';
  reviewed: boolean;
}[] = [
  { slug: 'how-it-works', key: 'how', reviewed: false },
  { slug: 'about', key: 'about', reviewed: false },
  { slug: 'privacy', key: 'privacy', reviewed: false },
  { slug: 'terms', key: 'terms', reviewed: false },
];

export type StaticSlug = 'how-it-works' | 'about' | 'privacy' | 'terms';

export const staticPage = (slug: string) =>
  STATIC_PAGES.find((p) => p.slug === slug);
/** The Handspark pages added in step 6: noindex and out of the sitemap until the owner approves each page's text (same rule as above). */
export const THEME_PAGES: readonly { slug: string; reviewed: boolean }[] = [
  { slug: 'faq', reviewed: false },
  { slug: 'gallery', reviewed: false },
  { slug: 'journal', reviewed: false },
  { slug: 'shop', reviewed: false },
];
export const isIndexable = (slug: string) =>
  staticPage(slug)?.reviewed === true ||
  THEME_PAGES.find((p) => p.slug === slug)?.reviewed === true;
export const indexableStaticSlugs = () => [
  ...STATIC_PAGES.filter((p) => p.reviewed).map((p) => p.slug),
  ...THEME_PAGES.filter((p) => p.reviewed).map((p) => p.slug),
];
