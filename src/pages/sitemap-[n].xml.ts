export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings, siteConfig } from '../modules/config';
import { listSitemapPaths } from '../modules/directory/queries';
import { indexableStaticSlugs } from '../modules/seo/pages';
import { sitemapPlan } from '../modules/seo/sitemap';

/** One child file of the sitemap index; 404 when the site is small enough for a single file or the number is out of range. */
export const GET: APIRoute = async ({ params }) => {
  const { siteUrl, languages, indexable } = siteConfig(env);
  const n = /^[1-9]\d{0,3}$/.test(params.n ?? '') ? Number(params.n) : 0;
  if (!indexable || n === 0) return new Response('Not found', { status: 404 });
  const paths = [
    ...(await listSitemapPaths(requireBindings(env).DB)),
    ...indexableStaticSlugs().map((slug) => `/${slug}`),
  ];
  const plan = sitemapPlan({ siteUrl, languages, paths });
  const child = 'children' in plan ? plan.children[n - 1] : undefined;
  if (child === undefined) return new Response('Not found', { status: 404 });
  return new Response(child, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
