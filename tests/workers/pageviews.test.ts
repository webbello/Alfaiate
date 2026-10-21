import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  recordPageView,
  referrerBucket,
  shouldCount,
  trafficSummary,
} from '../../src/modules/analytics/pageviews';

const db = env.DB;
const req = (headers: Record<string, string> = {}, method = 'GET') =>
  new Request('https://example.test/tailors', {
    method,
    headers: { 'user-agent': 'Mozilla/5.0 (Android 13) Chrome/120', ...headers },
  });
const html = 'text/html; charset=utf-8';

describe('shouldCount (ANA-01)', () => {
  it('counts a normal public page view', () => {
    expect(shouldCount(req(), '/tailors', 200, html)).toBe(true);
    expect(shouldCount(req(), '/tet/areas/dili', 200, html)).toBe(true);
  });
  it.each(['/admin', '/admin/traffic', '/api/contact-click', '/media/x/y', '/_astro/a.css', '/robots.txt', '/sitemap.xml', '/icons.svg'])(
    'does not count %s',
    (path) => expect(shouldCount(req(), path, 200, html)).toBe(false),
  );
  it('ignores non-GET, non-200 and non-HTML responses', () => {
    expect(shouldCount(req({}, 'POST'), '/request', 200, html)).toBe(false);
    expect(shouldCount(req(), '/x', 404, html)).toBe(false);
    expect(shouldCount(req(), '/x', 200, 'application/json')).toBe(false);
    expect(shouldCount(req(), '/x', 200, null)).toBe(false);
  });
  it('ignores bots, missing user agents, Do Not Track and Global Privacy Control', () => {
    expect(shouldCount(req({ 'user-agent': 'Googlebot/2.1' }), '/', 200, html)).toBe(false);
    expect(shouldCount(req({ 'user-agent': '' }), '/', 200, html)).toBe(false);
    expect(shouldCount(req({ dnt: '1' }), '/', 200, html)).toBe(false);
    expect(shouldCount(req({ 'sec-gpc': '1' }), '/', 200, html)).toBe(false);
  });
  it('sees through an encoded admin prefix and refuses a broken encoding', () => {
    expect(shouldCount(req(), '/%61dmin/login', 200, html)).toBe(false);
    expect(shouldCount(req(), '/%E0%A4%A', 200, html)).toBe(false);
  });
  it('ignores very long paths', () => {
    expect(shouldCount(req(), '/' + 'a'.repeat(130), 200, html)).toBe(false);
  });
});

describe('referrerBucket', () => {
  const host = 'alfaiate.example';
  it('groups search, social, internal and direct; never keeps a full address', () => {
    expect(referrerBucket(null, host)).toBe('direct');
    expect(referrerBucket('not a url', host)).toBe('direct');
    expect(referrerBucket('https://www.google.com/search?q=secret', host)).toBe('search');
    expect(referrerBucket('https://l.facebook.com/l.php?u=1', host)).toBe('social');
    expect(referrerBucket('https://alfaiate.example/tailors', host)).toBe('internal');
    expect(referrerBucket('https://blog.example.org/post?id=3', host)).toBe('other');
    expect(referrerBucket('https://google.evil.com/', host)).toBe('other');
    expect(referrerBucket('https://x.evil.com/', host)).toBe('other');
    expect(referrerBucket('https://www.google.com.tl/', host)).toBe('search');
    expect(referrerBucket('https://m.facebook.com/', host)).toBe('social');
  });
});

describe('recordPageView and trafficSummary', () => {
  const now = new Date('2026-06-10T09:00:00.000Z');
  it('adds up visits per day, path and source, and summarises the window', async () => {
    await recordPageView(db, { pathname: '/pv-a/', referrer: 'search', now });
    await recordPageView(db, { pathname: '/pv-a', referrer: 'search', now });
    await recordPageView(db, { pathname: '/PV%2Da', referrer: 'direct', now });
    await recordPageView(db, { pathname: '/pv-b', referrer: 'internal', now });
    await recordPageView(db, { pathname: '/pv-old', referrer: 'direct', now: new Date('2026-04-01T09:00:00.000Z') });
    const t = await trafficSummary(db, 30, now);
    expect(t.topPages.find((p) => p.path === '/pv-a')?.views).toBe(3);
    expect(t.topPages.some((p) => p.path === '/pv-old')).toBe(false);
    expect(t.sources.find((s) => s.source === 'search')?.views).toBe(2);
    expect(t.sources.some((s) => s.source === 'internal')).toBe(false);
    expect(t.views).toBe(4);
    expect(t.daily.at(-1)).toEqual({ day: '2026-06-10', views: 4 });
  });
  it('never throws when the write fails', async () => {
    const broken = { prepare: () => { throw new Error('down'); } } as unknown as D1Database;
    await expect(recordPageView(broken, { pathname: '/x', referrer: 'direct' })).resolves.toBeUndefined();
  });
});
