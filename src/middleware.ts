import { defineMiddleware } from 'astro:middleware';
import { applySecurityHeaders } from './modules/auth/headers';

export const onRequest = defineMiddleware(async (context, next) =>
  applySecurityHeaders(await next(), context.url.pathname),
);
