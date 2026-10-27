import { normalisePhone } from '../contact-links/phone';
import { enabledLanguages, type Lang } from '../../i18n/lang';
import { isIndexable } from '../seo/indexable';

export class ConfigError extends Error {}

type Bindings = Pick<Cloudflare.Env, 'DB' | 'MEDIA_PUBLIC' | 'MEDIA_PRIVATE'>;

// Free-plan mode: R2 needs a payment card, so the photo buckets are optional. Without them the site runs with no stored photos:
// readers see nothing (so public pages use their stand-ins), uploads are refused with a clear message (`photosEnabled`).
const OFF = new WeakSet<object>();
const offBucket = (): R2Bucket => {
  const bucket = {
    get: async () => null,
    head: async () => null,
    list: async () => ({
      objects: [],
      delimitedPrefixes: [],
      truncated: false,
    }),
    delete: async () => undefined,
    put: async () => {
      throw new ConfigError('Photo storage is switched off on this deployment');
    },
  } as unknown as R2Bucket;
  OFF.add(bucket);
  return bucket;
};

/** True when both photo buckets are bound. Upload pages and endpoints check this before they accept a photo. */
export function photosEnabled(env: Partial<Bindings>): boolean {
  return Boolean(env.MEDIA_PUBLIC && env.MEDIA_PRIVATE);
}

/**
 * Returns the bindings the app needs, or throws naming the missing ones (fails closed). The database is required; the two photo buckets
 * come as a pair: both bound (photos on) or both absent (photos off, stand-in buckets that hold nothing). One without the other is a mistake.
 */
export function requireBindings(env: Partial<Bindings>): Bindings {
  if (!env.DB) throw new ConfigError('Missing bindings: DB');
  if (Boolean(env.MEDIA_PUBLIC) !== Boolean(env.MEDIA_PRIVATE))
    throw new ConfigError(
      `Missing bindings: ${env.MEDIA_PUBLIC ? 'MEDIA_PRIVATE' : 'MEDIA_PUBLIC'} (bind both photo buckets or neither)`,
    );
  return {
    DB: env.DB,
    MEDIA_PUBLIC: env.MEDIA_PUBLIC ?? offBucket(),
    MEDIA_PRIVATE: env.MEDIA_PRIVATE ?? offBucket(),
  };
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

const E164_ANY = /^\+[1-9][0-9]{7,14}$/;
/** Any valid international number (spaces and dashes allowed) as +<digits>, or null. Used for order numbers, which may be outside Timor-Leste. */
export function internationalNumber(
  raw: string | undefined | null,
): string | null {
  const compact = (raw ?? '').replace(/[\s().-]/g, '');
  return E164_ANY.test(compact) ? compact : null;
}

/** The admin's WhatsApp number that receives shop orders (S6): ORDER_WHATSAPP, else the site number. Null when neither is set, and ordering then says so. */
export function orderWhatsapp(env: {
  ORDER_WHATSAPP?: string;
  SITE_WHATSAPP?: string;
}): string | null {
  return internationalNumber(env.ORDER_WHATSAPP) ?? siteWhatsapp(env);
}

/** The tailor interest form stays off until the owner has approved its consent wording and the Privacy text (OQ-08). Exactly "true" turns it on; anything else is off. */
export const joinEnabled = (env: { JOIN_ENABLED?: string }): boolean =>
  env.JOIN_ENABLED === 'true';

/** Development only: shows clearly labelled sample testimonials so the section's layout can be reviewed. Exactly "true" turns it on; production never sets it (BR-11). */
export const testimonialPlaceholders = (env: {
  SHOW_TESTIMONIAL_PLACEHOLDERS?: string;
}) => env.SHOW_TESTIMONIAL_PLACEHOLDERS === 'true';

/** Staging preview of journal articles that are still drafts in the content editor. Exactly "true" turns it on; production never sets it (BR-11). */
export const draftPosts = (env: { SHOW_DRAFT_POSTS?: string }) =>
  env.SHOW_DRAFT_POSTS === 'true';

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

/** The token for Google Search Console's HTML-tag check (letters, digits, - and _ only, so it can never break out of the attribute). */
export const googleSiteVerification = (env: {
  GOOGLE_SITE_VERIFICATION?: string;
}): string | null => {
  const token = env.GOOGLE_SITE_VERIFICATION?.trim() ?? '';
  return /^[A-Za-z0-9_-]{10,100}$/.test(token) ? token : null;
};
