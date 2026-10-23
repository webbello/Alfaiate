import { pathFor, type Lang } from '../../i18n/lang';
import type { Dictionary } from '../../i18n/public/en';

export type Link = { label: string; href: string };
export type FooterGroup = { title: string; links: Link[] };

/**
 * The theme's three menus filled with Alfaiate TL's pages and words, in the page's language. Links to pages that are still on the old frame
 * (services, craft, business, how it works) work as before; theme-only routes (shop, blog, gallery) are added when those pages exist (docs/SPEC-handspark-theme.md).
 */
export function shellNav(t: Dictionary, lang: Lang) {
  const to = (path: string) => pathFor(lang, path);
  const nav: Link[] = [
    { label: t.nav.home, href: to('/') },
    { label: t.nav.tailors, href: to('/tailors') },
    { label: t.nav.about, href: to('/about') },
    { label: t.nav.contact, href: to('/contact') },
  ];
  const mega: Link[] = [
    { label: t.nav.services, href: to('/services') },
    { label: t.nav.craft, href: to('/craft') },
    { label: t.nav.business, href: to('/business') },
    { label: t.nav.how, href: to('/how-it-works') },
    { label: t.nav.request, href: to('/request') },
    { label: t.footer.privacy, href: to('/privacy') },
    { label: t.footer.terms, href: to('/terms') },
  ];
  const footer: FooterGroup[] = [
    {
      title: t.footer.explore,
      links: [
        { label: t.nav.tailors, href: to('/tailors') },
        { label: t.nav.services, href: to('/services') },
        { label: t.nav.craft, href: to('/craft') },
        { label: t.nav.business, href: to('/business') },
      ],
    },
    {
      title: t.footer.support,
      links: [
        { label: t.footer.about, href: to('/about') },
        { label: t.nav.how, href: to('/how-it-works') },
        { label: t.footer.contact, href: to('/contact') },
        { label: t.footer.privacy, href: to('/privacy') },
        { label: t.footer.terms, href: to('/terms') },
      ],
    },
  ];
  return { nav, mega, footer, home: to('/') };
}
