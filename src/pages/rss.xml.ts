export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { siteConfig } from '../modules/config';
import { POSTS } from '../modules/journal/posts';
import { dictionary } from '../i18n/public';
import { isIndexable } from '../modules/seo/pages';

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The journal feed (English). Owner-approved articles only, never samples; empty until the journal is approved for indexing. */
export const GET: APIRoute = async () => {
  const { siteUrl, indexable } = siteConfig(env);
  const t = dictionary('en');
  const items =
    indexable && isIndexable('journal')
      ? [...POSTS]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(
            (p) =>
              `    <item>\n      <title>${escapeXml(p.title.en)}</title>\n      <link>${escapeXml(`${siteUrl}/journal/${p.slug}`)}</link>\n      <guid>${escapeXml(`${siteUrl}/journal/${p.slug}`)}</guid>\n      <pubDate>${new Date(p.date).toUTCString()}</pubDate>\n      <description>${escapeXml(p.excerpt.en)}</description>\n    </item>`,
          )
      : [];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${escapeXml(`${t.siteName} · ${t.journal.heading}`)}</title>\n    <link>${escapeXml(`${siteUrl}/journal`)}</link>\n    <description>${escapeXml(t.journal.intro)}</description>\n    <language>en</language>\n${items.join('\n')}\n  </channel>\n</rss>\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
