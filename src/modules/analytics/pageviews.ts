import { diliDay, addDays } from '../referral/dates';

// First-party, cookie-free visit counts (ANA-01). Only public HTML pages are counted, by Dili day, path and referring site.
// shortcut: one D1 write per counted visit is fine for the pilot; batch in memory or move to Workers Analytics Engine if traffic passes about 50,000 visits a day.

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|monitor|curl|wget|python|node-fetch|go-http|axios|httpclient|scrapy/i;
const SKIP_PREFIX = ['/admin', '/portal', '/api/', '/media/', '/_astro', '/fonts/', '/images/', '/icons.svg', '/robots.txt', '/sitemap', '/favicon'];

/** Whole domains only, so `google.evil.com` or `x.evil.com` cannot pass as a search engine or social site. */
const SEARCH = /^(.+\.)?(google|bing|duckduckgo|yahoo|yandex|ecosia|baidu)\.[a-z]{2,3}(\.[a-z]{2})?$/;
const SOCIAL = ['facebook.com', 'instagram.com', 't.co', 'twitter.com', 'x.com', 'youtube.com', 'tiktok.com', 'linkedin.com', 'pinterest.com', 'whatsapp.com', 'wa.me', 'fb.com'];

/** The path as the router sees it: decoded and lower-case, or null when it is not valid. */
export function normalisePath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname).toLowerCase();
  } catch {
    return null;
  }
}

export function shouldCount(
  request: Request,
  pathname: string,
  status: number,
  contentType: string | null,
): boolean {
  if (request.method !== 'GET' || status !== 200) return false;
  if (!(contentType ?? '').startsWith('text/html')) return false;
  const path = normalisePath(pathname);
  if (!path || path.length > 120 || SKIP_PREFIX.some((p) => path.startsWith(p))) return false;
  if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') return false;
  const ua = request.headers.get('user-agent') ?? '';
  return ua.length > 0 && !BOT.test(ua);
}

/** "direct", "internal", "search", "social" or "other": never a host name or address, so a forged Referer cannot add rows or text. */
export function referrerBucket(referer: string | null, siteHost: string): string {
  if (!referer) return 'direct';
  let host: string;
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    return 'direct';
  }
  if (host === siteHost) return 'internal';
  if (SEARCH.test(host)) return 'search';
  if (SOCIAL.some((d) => host === d || host.endsWith(`.${d}`))) return 'social';
  return 'other';
}

export async function recordPageView(
  db: D1Database,
  input: { pathname: string; referrer: string; now?: Date },
): Promise<void> {
  try {
    const path = (normalisePath(input.pathname) ?? '/').replace(/\/+$/, '') || '/';
    // shortcut: no scheduler yet, so about one write in 200 also deletes counts older than 400 days; use a cron trigger if that ever matters.
    if (Math.random() < 0.005)
      await db.prepare("DELETE FROM page_view_daily WHERE day < date('now', '-400 days')").run();
    await db
      .prepare(
        'INSERT INTO page_view_daily (day, path, referrer, count) VALUES (?, ?, ?, 1) ON CONFLICT (day, path, referrer) DO UPDATE SET count = count + 1',
      )
      .bind(diliDay(input.now ?? new Date()), path, input.referrer)
      .run();
  } catch {
    // counting must never affect the page
  }
}

export type Traffic = {
  days: number;
  views: number;
  topPages: { path: string; views: number }[];
  sources: { source: string; views: number }[];
  daily: { day: string; views: number }[];
};

/** The last `days` Dili days including today. */
export async function trafficSummary(db: D1Database, days = 30, now = new Date()): Promise<Traffic> {
  const from = addDays(diliDay(now), -(days - 1));
  const [pages, sources, daily] = await db.batch<{ path?: string; source?: string; day?: string; views: number }>([
    db.prepare('SELECT path, sum(count) AS views FROM page_view_daily WHERE day >= ? GROUP BY path ORDER BY views DESC, path LIMIT 15').bind(from),
    db.prepare("SELECT referrer AS source, sum(count) AS views FROM page_view_daily WHERE day >= ? AND referrer <> 'internal' GROUP BY referrer ORDER BY views DESC, referrer LIMIT 12").bind(from),
    db.prepare('SELECT day, sum(count) AS views FROM page_view_daily WHERE day >= ? GROUP BY day ORDER BY day').bind(from),
  ]);
  return {
    days,
    views: daily.results.reduce((n, r) => n + r.views, 0),
    topPages: pages.results.map((r) => ({ path: r.path!, views: r.views })),
    sources: sources.results.map((r) => ({ source: r.source!, views: r.views })),
    daily: daily.results.map((r) => ({ day: r.day!, views: r.views })),
  };
}
