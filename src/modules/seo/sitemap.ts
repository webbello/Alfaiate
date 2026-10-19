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

export function buildRobots(siteUrl: string): string {
  return [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /api',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}
