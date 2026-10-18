import { describe, expect, it } from 'vitest';
import { applySecurityHeaders } from '../../src/modules/auth/headers';

const get = (path: string, init?: ResponseInit) =>
  applySecurityHeaders(new Response('body', init), path);

describe('security headers on every response (SEC-08)', () => {
  for (const path of ['/', '/tailors', '/admin', '/admin/login']) {
    it(`sets the baseline headers on ${path}`, () => {
      const h = get(path).headers;
      expect(h.get('x-content-type-options')).toBe('nosniff');
      expect(h.get('referrer-policy')).toBeTruthy();
      expect(h.get('strict-transport-security')).toMatch(/max-age=\d+/);
      const csp = h.get('content-security-policy') ?? '';
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toContain('unsafe-eval');
    });
  }
});

describe('admin pages are never indexed or cached (SEC-06)', () => {
  for (const path of [
    '/admin',
    '/admin/',
    '/admin/login',
    '/admin/users/3',
    '/%61dmin/users',
    '/%41DMIN',
    '/ADMIN/users',
  ]) {
    it(`sets noindex and no-store on ${path}`, () => {
      const h = get(path).headers;
      expect(h.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(h.get('cache-control')).toBe('no-store');
    });
  }

  it('overrides a cache header set by the page', () => {
    expect(
      get('/admin', {
        headers: { 'cache-control': 'public, max-age=3600' },
      }).headers.get('cache-control'),
    ).toBe('no-store');
  });

  it('leaves public pages cacheable and indexable, and does not treat /administrator as admin', () => {
    for (const path of ['/', '/tailors/ana', '/administrator']) {
      const h = get(path).headers;
      expect(h.get('x-robots-tag')).toBeNull();
      expect(h.get('cache-control')).toBeNull();
    }
  });
});

describe('applySecurityHeaders', () => {
  it('works on a response whose headers are immutable (a redirect) and keeps its status and location', () => {
    const redirect = Response.redirect('https://example.test/admin/login', 302);
    const result = applySecurityHeaders(redirect, '/admin');
    expect(result.status).toBe(302);
    expect(result.headers.get('location')).toBe(
      'https://example.test/admin/login',
    );
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps the body', async () => {
    expect(await get('/x', { status: 404 }).text()).toBe('body');
  });
});

describe('responses that set a cookie are never cached', () => {
  it('adds no-store to any response with Set-Cookie, wherever it is served', () => {
    const h = get('/somewhere', { headers: { 'set-cookie': 'a=b' } }).headers;
    expect(h.get('cache-control')).toBe('no-store');
  });
});
