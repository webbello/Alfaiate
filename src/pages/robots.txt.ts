export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { siteConfig } from '../modules/config';
import { buildRobots } from '../modules/seo/sitemap';

export const GET: APIRoute = () =>
  new Response(
    buildRobots(siteConfig(env).siteUrl, siteConfig(env).indexable),
    {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    },
  );
