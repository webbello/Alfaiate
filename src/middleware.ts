import { defineMiddleware } from 'astro:middleware';
import { env, waitUntil } from 'cloudflare:workers';
import { isEnabled, parsePath } from './i18n/lang';
import {
  recordPageView,
  referrerBucket,
  shouldCount,
} from './modules/analytics/pageviews';
import { applySecurityHeaders } from './modules/auth/headers';
import { configurePasswordIterations } from './modules/auth/password';
import { siteConfig } from './modules/config';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  // Free-plan mode: fewer password rounds when the deployment says so (docs/DEPLOY.md).
  configurePasswordIterations(
    (env as { PASSWORD_ITERATIONS?: string }).PASSWORD_ITERATIONS,
  );
  const { languages, indexable } = siteConfig(env);
  // Tetum is served only when PUBLIC_LANGUAGES includes it; otherwise every /tet/... address is a plain 404.
  if (parsePath(pathname).lang === 'tet' && !isEnabled('tet', languages)) {
    return applySecurityHeaders(
      await context.rewrite('/404'),
      pathname,
      indexable,
    );
  }
  const response = await next();
  // Cookie-free visit count (ANA-01): after the response, never blocks or breaks a page.
  if (
    shouldCount(
      context.request,
      pathname,
      response.status,
      response.headers.get('content-type'),
    )
  ) {
    waitUntil(
      recordPageView(env.DB, {
        pathname,
        referrer: referrerBucket(
          context.request.headers.get('referer'),
          context.url.hostname,
        ),
      }),
    );
  }
  return applySecurityHeaders(response, pathname, indexable);
});
