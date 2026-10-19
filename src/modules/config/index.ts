import { enabledLanguages, type Lang } from '../../i18n/lang';

export class ConfigError extends Error {}

const REQUIRED = ['DB', 'MEDIA_PUBLIC', 'MEDIA_PRIVATE'] as const;

type Bindings = Pick<Cloudflare.Env, (typeof REQUIRED)[number]>;

/** Returns the bindings the app needs, or throws naming the missing ones (fails closed). */
export function requireBindings(env: Partial<Bindings>): Bindings {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0)
    throw new ConfigError(`Missing bindings: ${missing.join(', ')}`);
  return env as Bindings;
}

/** Public-site settings. `SITE_URL` must be an https origin (http only for localhost); anything else fails closed. */
export function siteConfig(env: {
  SITE_URL?: string;
  PUBLIC_LANGUAGES?: string;
}): { siteUrl: string; languages: Lang[] } {
  let url: URL;
  try {
    url = new URL(env.SITE_URL ?? '');
  } catch {
    throw new ConfigError('SITE_URL is missing or not a URL');
  }
  const safeScheme =
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && url.hostname === 'localhost');
  if (
    !safeScheme ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new ConfigError('SITE_URL must be a plain https origin');
  }
  return {
    siteUrl: url.origin,
    languages: enabledLanguages(env.PUBLIC_LANGUAGES),
  };
}
