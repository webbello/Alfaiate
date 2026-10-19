import { LANGUAGES, pathFor, type Lang } from '../../i18n/lang';

export type HeadInput = {
  siteUrl: string;
  languages: readonly Lang[];
  lang: Lang;
  /** Path of the page without the language prefix; any query string or fragment is dropped. */
  rest: string;
  /** Page is not indexable: true -> "noindex,follow", 'nofollow' -> "noindex,nofollow". */
  noindex?: boolean | 'nofollow';
  /** Canonical path (without language prefix) when it differs from `rest`, e.g. filtered lists point at the plain list. */
  canonicalRest?: string;
  /** false for pages that are not real addresses (the 404 page): no canonical, no alternates. */
  canonical?: boolean;
  /** false (staging, local): every page is noindex,nofollow whatever else is set. */
  indexable: boolean;
};

const cleanPath = (path: string) => path.split(/[?#]/)[0];

export function buildHead(input: HeadInput) {
  const robots = !input.indexable
    ? 'noindex,nofollow'
    : input.noindex === 'nofollow'
      ? 'noindex,nofollow'
      : input.noindex
        ? 'noindex,follow'
        : null;
  if (input.canonical === false)
    return { canonical: null, alternates: [], robots };

  const url = (lang: Lang, rest: string) =>
    `${input.siteUrl}${pathFor(lang, cleanPath(rest))}`;
  const canonicalRest = input.canonicalRest ?? input.rest;
  const alternates = LANGUAGES.filter((lang) =>
    input.languages.includes(lang),
  ).map((lang) => ({
    hreflang: lang as string,
    href: url(lang, canonicalRest),
  }));
  alternates.push({ hreflang: 'x-default', href: url('en', canonicalRest) });
  return { canonical: url(input.lang, canonicalRest), alternates, robots };
}
