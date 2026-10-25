import { isEnabled, parsePath, pathFor, type Lang } from './lang';

/** The first language this site serves in the browser's `Accept-Language` list (highest weight first), or null. Tetum is `tet` (some systems send `tdt`). */
export function preferredLanguage(header: string | null): Lang | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part, order) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params
        .map((p) => /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(p)?.[1])
        .find(Boolean);
      const weight = q === undefined ? 1 : Number(q);
      return { primary: tag.trim().toLowerCase().split('-')[0], weight, order };
    })
    .filter((r) => r.primary && r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.order - b.order);
  for (const { primary } of ranked) {
    if (primary === 'en') return 'en';
    if (primary === 'tet' || primary === 'tdt') return 'tet';
  }
  return null;
}

// English pages that have a Tetum twin under /tet (src/pages/tet). Anything else (admin, portal, api, media, files) is never redirected.
const TWINNED = new Set([
  '/',
  '/about',
  '/business',
  '/contact',
  '/craft',
  '/faq',
  '/gallery',
  '/how-it-works',
  '/join',
  '/newsletter',
  '/privacy',
  '/request',
  '/services',
  '/terms',
  '/journal',
  '/shop',
  '/tailors',
]);
const TWINNED_PREFIXES = [
  '/areas/',
  '/categories/',
  '/journal/',
  '/shop/',
  '/tailors/',
];

/**
 * Where to send a first visit whose browser prefers Tetum, or null to serve the page as asked. Only a person arriving at an English page from outside the site
 * (typed address, bookmark, search result: `Sec-Fetch-Site` none or cross-site) is moved, so the EN link on a Tetum page always works, and no cookie is needed.
 */
export function tetumRedirect(
  request: Request,
  url: URL,
  languages: readonly Lang[],
): string | null {
  if (request.method !== 'GET' || !isEnabled('tet', languages)) return null;
  const headers = request.headers;
  if (headers.get('sec-fetch-dest') !== 'document') return null;
  if (!['none', 'cross-site'].includes(headers.get('sec-fetch-site') ?? ''))
    return null;
  const { lang, rest } = parsePath(url.pathname);
  if (lang !== 'en') return null;
  const clean = rest.length > 1 ? rest.replace(/\/$/, '') : rest;
  if (!TWINNED.has(clean) && !TWINNED_PREFIXES.some((p) => clean.startsWith(p)))
    return null;
  if (preferredLanguage(headers.get('accept-language')) !== 'tet') return null;
  return pathFor('tet', clean) + url.search;
}
