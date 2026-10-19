import { LANGUAGES, pathFor, type Lang } from '../../i18n/lang';

const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * sitemap.xml for the given pages (paths without a language prefix). Each page appears once per enabled language, every entry
 * carries the alternates for all enabled languages plus x-default. Callers pass only published, indexable pages (AC-05).
 */
export function buildSitemap({
  siteUrl,
  languages,
  paths,
}: {
  siteUrl: string;
  languages: readonly Lang[];
  paths: string[];
}): string {
  const enabled = LANGUAGES.filter((lang) => languages.includes(lang));
  const url = (lang: Lang, path: string) =>
    escapeXml(`${siteUrl}${pathFor(lang, path)}`);
  const entries = paths
    .filter((path) => path.startsWith('/') && !path.startsWith('//'))
    .flatMap((path) =>
      enabled.map((lang) => {
        const alternates = [
          ...enabled.map((l) => ({ hreflang: l as string, lang: l })),
          { hreflang: 'x-default', lang: 'en' as Lang },
        ]
          .map(
            (a) =>
              `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${url(a.lang, path)}"/>`,
          )
          .join('\n');
        return `  <url>\n    <loc>${url(lang, path)}</loc>\n${alternates}\n  </url>`;
      }),
    );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

/** A sitemap file holds at most this many entries (one per page and language). */
export const SITEMAP_LIMIT = 5000;

export type SitemapPlan =
  { single: string } | { index: string; children: string[] };

/** One file when it fits, otherwise an index plus child files; both languages of a page always land in the same file. */
export function sitemapPlan({
  siteUrl,
  languages,
  paths,
}: {
  siteUrl: string;
  languages: readonly Lang[];
  paths: string[];
}): SitemapPlan {
  const valid = paths.filter((p) => p.startsWith('/') && !p.startsWith('//'));
  const perPage = Math.max(
    1,
    LANGUAGES.filter((l) => languages.includes(l)).length,
  );
  if (valid.length * perPage <= SITEMAP_LIMIT)
    return { single: buildSitemap({ siteUrl, languages, paths: valid }) };
  const perFile = Math.max(1, Math.floor(SITEMAP_LIMIT / perPage));
  const children: string[] = [];
  for (let i = 0; i < valid.length; i += perFile)
    children.push(
      buildSitemap({ siteUrl, languages, paths: valid.slice(i, i + perFile) }),
    );
  const entries = children
    .map(
      (_, i) =>
        `  <sitemap>\n    <loc>${escapeXml(`${siteUrl}/sitemap-${i + 1}.xml`)}</loc>\n  </sitemap>`,
    )
    .join('\n');
  return {
    index: `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`,
    children,
  };
}

export function buildRobots(siteUrl: string, indexable: boolean): string {
  // Not indexable (staging, local): ask every crawler to stay away and offer no sitemap.
  if (!indexable) return ['User-agent: *', 'Disallow: /', ''].join('\n');
  return [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /api',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}
