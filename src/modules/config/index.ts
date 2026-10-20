import { normalisePhone } from '../contact-links/phone';
import { enabledLanguages, type Lang } from '../../i18n/lang';
import { isIndexable } from '../seo/indexable';

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
  SITE_INDEXABLE?: string;
}): { siteUrl: string; languages: Lang[]; indexable: boolean } {
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
    indexable: isIndexable(env.SITE_INDEXABLE),
  };
}

/** Signing secret for the form's fill-time token. Missing or short fails closed: the form must not run without its time check. */
export function formSecret(env: { FORM_TOKEN_SECRET?: string }): string {
  const secret = env.FORM_TOKEN_SECRET ?? '';
  // the example value from .dev.vars.example is public, so it must never count as a secret
  if (secret.length < 16 || secret.startsWith('replace-me'))
    throw new ConfigError('FORM_TOKEN_SECRET is missing or too short');
  return secret;
}

/** The owner's WhatsApp number for the site-wide quick action (OQ-06). Anything that is not a Timor-Leste number means "not set": the link is then simply not shown. */
export function siteWhatsapp(env: { SITE_WHATSAPP?: string }): string | null {
  return env.SITE_WHATSAPP ? normalisePhone(env.SITE_WHATSAPP) : null;
}

/** The tailor interest form stays off until the owner has approved its consent wording and the Privacy text (OQ-08). Exactly "true" turns it on; anything else is off. */
export const joinEnabled = (env: { JOIN_ENABLED?: string }): boolean =>
  env.JOIN_ENABLED === 'true';

/** Development only: shows clearly labelled sample testimonials so the section's layout can be reviewed. Exactly "true" turns it on; production never sets it (BR-11). */
export const testimonialPlaceholders = (env: {
  SHOW_TESTIMONIAL_PLACEHOLDERS?: string;
}) => env.SHOW_TESTIMONIAL_PLACEHOLDERS === 'true';

const SOCIAL_HOSTS = {
  facebook: /^(www\.)?(facebook\.com|fb\.com)$/,
  instagram: /^(www\.)?instagram\.com$/,
  youtube: /^(www\.)?(youtube\.com|youtu\.be)$/,
} as const;
export type SocialName = keyof typeof SOCIAL_HOSTS | 'whatsapp';
/** Footer social links: only https addresses on the platform's own domain, so a typo or a bad value can never put a foreign link in the footer. WhatsApp reuses SITE_WHATSAPP. */
export function socialLinks(env: {
  SOCIAL_FACEBOOK?: string;
  SOCIAL_INSTAGRAM?: string;
  SOCIAL_YOUTUBE?: string;
  SITE_WHATSAPP?: string;
}): { name: SocialName; href: string }[] {
  const links: { name: SocialName; href: string }[] = [];
  for (const [name, host] of Object.entries(SOCIAL_HOSTS) as [
    keyof typeof SOCIAL_HOSTS,
    RegExp,
  ][]) {
    const raw = env[`SOCIAL_${name.toUpperCase()}` as 'SOCIAL_FACEBOOK'];
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (
        url.protocol === 'https:' &&
        host.test(url.hostname) &&
        !url.username &&
        !url.password
      )
        links.push({ name, href: url.href });
    } catch {
      /* not a URL: left out */
    }
  }
  const whatsapp = siteWhatsapp(env);
  if (whatsapp)
    links.push({
      name: 'whatsapp',
      href: `https://wa.me/${whatsapp.slice(1)}`,
    });
  return links;
}

/** Optional "we aim to reply" wording the owner can honour (OQ-05), per language, for example "within one working day". Empty or unset means no promise is shown. */
export function responseWindow(
  env: { RESPONSE_WINDOW_EN?: string; RESPONSE_WINDOW_TET?: string },
  lang: 'en' | 'tet',
): string | null {
  const text =
    (lang === 'tet'
      ? env.RESPONSE_WINDOW_TET
      : env.RESPONSE_WINDOW_EN
    )?.trim() ?? '';
  return text && text.length <= 80 ? text : null;
}
