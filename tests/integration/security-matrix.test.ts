import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, get, signIn, unique } from './helpers';
import { worker } from './worker';

// SEC-02/03/05/06/08 across every class of response the site can produce.
const db = env.DB;
const slug = `sm-${unique()}`;
const send = (path: string, init: RequestInit = {}) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, { redirect: 'manual', ...init }),
  );
const post = (path: string, body: string, origin: string | null = ORIGIN) =>
  send(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `198.51.100.${unique() % 250}`,
      ...(origin ? { Origin: origin } : {}),
    },
    body,
  });

type Case = [string, () => Promise<Response>];
let cases: Case[] = [];
const setup = async () => {
  await db
    .prepare(
      "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164, phone_e164) VALUES (?, 'SM Fake', 'approved', 1, 1, 1, '+67077123456', '+67033123456')",
    )
    .bind(slug)
    .run();
  const editor = await signIn('editor');
  cases = [
    // public pages, both languages, errors and files
    ['home', () => get('/')],
    ['tet home', () => get('/tet/')],
    ['directory', () => get('/tailors')],
    ['profile', () => get(`/tailors/${slug}`)],
    ['category 404', () => get('/categories/no-such')],
    ['request form', () => get('/request')],
    ['thanks', () => get('/request/thanks?ref=AT-ABCD2345')],
    ['static', () => get('/how-it-works')],
    ['404 page', () => get('/no-such-page')],
    ['tet 404 page', () => get('/tet/no-such-page')],
    ['robots', () => get('/robots.txt')],
    ['sitemap', () => get('/sitemap.xml')],
    ['media 404', () => get(`/media/${'a'.repeat(32)}/thumb.jpg`)],
    ['media bad key', () => get('/media/..%2F..%2Fadmin')],
    // API and form posts, every outcome
    [
      'beacon 204',
      () =>
        post('/api/contact-click', JSON.stringify({ slug, channel: 'phone' })),
    ],
    ['beacon 400', () => post('/api/contact-click', 'not json')],
    ['beacon 403', () => post('/api/contact-click', '{}', 'https://evil.test')],
    [
      'beacon 404',
      () =>
        post(
          '/api/contact-click',
          JSON.stringify({ slug: 'nobody', channel: 'phone' }),
        ),
    ],
    ['beacon GET', () => get('/api/contact-click')],
    ['request post no origin', () => post('/request', 'x', null)],
    ['request wrong method', () => send('/request', { method: 'DELETE' })],
    // admin: sign-in page, redirects, refusals
    ['admin redirect', () => get('/admin')],
    ['admin login page', () => get('/admin/login')],
    ['admin 403', () => get('/admin/enquiries', editor)],
    ['admin 404', () => get('/admin/enquiries/999999', editor)],
  ];
};

describe('security headers on every kind of response (SEC-08)', () => {
  it('sends the full set, with the strict policy, whatever the status', async () => {
    await setup();
    for (const [name, run] of cases) {
      const r = await run();
      const h = r.headers;
      const csp = h.get('content-security-policy') ?? '';
      for (const part of [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ])
        expect(csp, `${name}: ${part}`).toContain(part);
      expect(csp, name).not.toContain('unsafe-inline');
      expect(csp, name).not.toContain('unsafe-eval');
      expect(h.get('x-content-type-options'), name).toBe('nosniff');
      expect(h.get('x-frame-options'), name).toBe('DENY');
      expect(h.get('referrer-policy'), name).toBe(
        'strict-origin-when-cross-origin',
      );
      expect(h.get('strict-transport-security'), name).toMatch(
        /max-age=\d{7,}/,
      );
      expect(h.get('permissions-policy'), name).toContain('camera=()');
    }
  });
});

describe('cookies (SEC-05, PRV-05)', () => {
  it('no public page, file or API response sets one', async () => {
    for (const [name, run] of cases.filter(([n]) => !n.startsWith('admin')))
      expect((await run()).headers.get('set-cookie'), name).toBeNull();
  });

  it('the admin sign-in page and every refusal set none either; only a successful sign-in does', async () => {
    for (const [name, run] of cases.filter(([n]) => n.startsWith('admin')))
      expect((await run()).headers.get('set-cookie'), name).toBeNull();
    const cookie = await signIn('manager');
    expect(cookie).toContain('__Host-alfaiate_session=');
  });
});

describe('caching (SEC-05, SEC-06)', () => {
  it('admin responses and anything with a cookie are never cached; form pages and the beacon are not cached either', async () => {
    for (const [name, run] of cases.filter(([n]) => n.startsWith('admin')))
      expect((await run()).headers.get('cache-control'), name).toMatch(
        /no-store/,
      );
    for (const [name, run] of cases.filter(([n]) =>
      [
        'request form',
        'thanks',
        'beacon 204',
        'beacon 400',
        'beacon 403',
        'beacon 404',
      ].includes(n),
    ))
      expect((await run()).headers.get('cache-control'), name).toMatch(
        /no-store/,
      );
  });

  it('admin pages are marked noindex in the header', async () => {
    for (const [name, run] of cases.filter(([n]) => n.startsWith('admin')))
      expect((await run()).headers.get('x-robots-tag'), name).toMatch(
        /noindex/,
      );
  });
});
