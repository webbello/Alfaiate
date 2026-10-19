export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings, siteConfig } from '../modules/config';
import { listSitemapPaths } from '../modules/directory/queries';
import { indexableStaticSlugs } from '../modules/seo/pages';
import { sitemapPlan } from '../modules/seo/sitemap';

const xml = (body: string) =>
  new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });

/** The sitemap, or an index of child files (`/sitemap-1.xml`, ...) when there are many pages. Empty when the site is not indexable. */
export const GET: APIRoute = async () => {
  const { siteUrl, languages, indexable } = siteConfig(env);
  const paths = indexable
    ? [
        ...(await listSitemapPaths(requireBindings(env).DB)),
        ...indexableStaticSlugs().map((slug) => `/${slug}`),
      ]
    : [];
  const plan = sitemapPlan({ siteUrl, languages, paths });
  return xml('single' in plan ? plan.single : plan.index);
};
