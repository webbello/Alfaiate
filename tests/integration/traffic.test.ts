import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, get, signIn } from './helpers';
import { worker } from './worker';

// ANA-01: cookie-free page-view counts, shown to people who may view enquiries.
const total = async (path: string) =>
  (await env.DB.prepare(
    'SELECT coalesce(sum(count), 0) AS n FROM page_view_daily WHERE path = ?',
  )
    .bind(path)
    .first<{ n: number }>())!.n;
const visit = (path: string, headers: Record<string, string> = {}) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/120', ...headers },
    }),
  );
const settle = () => new Promise((r) => setTimeout(r, 300));

describe('counting public visits', () => {
  it('counts a public page, with the referring group and no cookie', async () => {
    const before = await total('/tailors');
    const response = await visit('/tailors', {
      referer: 'https://www.google.com/search?q=x',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    await settle();
    expect(await total('/tailors')).toBe(before + 1);
    const row = await env.DB.prepare(
      "SELECT count(*) AS n FROM page_view_daily WHERE referrer = 'search'",
    ).first<{ n: number }>();
    expect(row!.n).toBeGreaterThan(0);
  });
  it('does not count bots, Do Not Track, Global Privacy Control or admin pages', async () => {
    const before = await total('/tailors');
    await visit('/tailors', { 'user-agent': 'Googlebot/2.1' });
    await visit('/tailors', { dnt: '1' });
    await visit('/tailors', { 'sec-gpc': '1' });
    await get('/admin/login');
    await settle();
    expect(await total('/tailors')).toBe(before);
    expect(await total('/admin/login')).toBe(0);
  });
  it('stores nothing that identifies a visitor', async () => {
    const cols = (
      await env.DB.prepare('PRAGMA table_info(page_view_daily)').all<{
        name: string;
      }>()
    ).results.map((c) => c.name);
    expect(cols).toEqual(['day', 'path', 'referrer', 'count']);
  });
});

describe('GET /admin/traffic', () => {
  it('needs a sign-in', async () => {
    expect((await get('/admin/traffic')).status).not.toBe(200);
  });
  it('is open to owner and manager, not to editor or viewer', async () => {
    for (const role of ['owner', 'manager']) {
      const r = await get('/admin/traffic', await signIn(role));
      expect(r.status, role).toBe(200);
      expect(await r.text()).toContain('Traffic');
    }
    for (const role of ['editor', 'viewer'])
      expect(
        (await get('/admin/traffic', await signIn(role))).status,
        role,
      ).toBe(403);
  });
});
