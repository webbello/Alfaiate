export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings, siteConfig } from '../modules/config';
import { listSitemapPaths } from '../modules/directory/queries';
import { indexableStaticSlugs } from '../modules/seo/pages';
import { buildSitemap } from '../modules/seo/sitemap';

export const GET: APIRoute = async () => {
  const { siteUrl, languages, indexable } = siteConfig(env);
  // Not indexable (staging): an empty sitemap, so nothing is offered to search engines.
  const paths = indexable
    ? [
        ...(await listSitemapPaths(requireBindings(env).DB)),
        ...indexableStaticSlugs().map((slug) => `/${slug}`),
      ]
    : [];
  return new Response(buildSitemap({ siteUrl, languages, paths }), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
