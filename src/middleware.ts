import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { isEnabled, parsePath } from './i18n/lang';
import { applySecurityHeaders } from './modules/auth/headers';
import { siteConfig } from './modules/config';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const { languages, indexable } = siteConfig(env);
  // Tetum is served only when PUBLIC_LANGUAGES includes it; otherwise every /tet/... address is a plain 404.
  if (parsePath(pathname).lang === 'tet' && !isEnabled('tet', languages)) {
    return applySecurityHeaders(
      await context.rewrite('/404'),
      pathname,
      indexable,
    );
  }
  return applySecurityHeaders(await next(), pathname, indexable);
});
