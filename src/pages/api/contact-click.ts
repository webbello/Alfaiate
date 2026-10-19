export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { recordContactClick } from '../../modules/analytics/contact-click';
import { requireBindings } from '../../modules/config';
import { readBody } from '../../modules/http/body';

const reply = (status: number) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
const STATUS = {
  recorded: 204,
  invalid: 400,
  not_found: 404,
  limited: 429,
} as const;

/** Beacon from the WhatsApp and Call buttons (ANA-02). Same-origin only, tiny body, no cookies, nothing personal stored. */
export const POST: APIRoute = async ({ request }) => {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return reply(403);
  const bytes = await readBody(request, 1024);
  if (bytes === null) return reply(413);
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return reply(400);
  }
  const { slug, channel } = (data ?? {}) as Record<string, unknown>;
  if (typeof slug !== 'string' || typeof channel !== 'string')
    return reply(400);
  const result = await recordContactClick(
    requireBindings(env).DB,
    { slug, channel },
    request.headers.get('cf-connecting-ip') ?? undefined,
  );
  return reply(STATUS[result]);
};
