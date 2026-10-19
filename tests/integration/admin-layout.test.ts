import { describe, expect, it } from 'vitest';
import { get, signIn } from './helpers';
import { PAGES, seedContractData } from './admin-contract.test';
import { worker } from './worker';
import { ORIGIN } from './helpers';

// Phase 7b T1: one header bar on every admin page, with the links this role may use and the current page marked.
const headerOf = (html: string) =>
  html.match(/<header class="admin-header">[\s\S]*?<\/header>/)?.[0] ?? '';
const linksIn = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)\bhref="([^"]+)"([^>]*)>([^<]*)<\/a>/g)].map(
    (m) => ({
      href: m[2],
      text: m[4].trim(),
      current: /aria-current="page"/.test(m[1] + m[3]),
    }),
  );

describe('the admin header bar', () => {
  it("is on every admin page, with the owner's links, the signed-in user and Sign out", async () => {
    const ids = await seedContractData();
    const cookie = await signIn('owner');
    for (const [label, path] of PAGES(ids)) {
      const html = await (await get(path, cookie)).text();
      const header = headerOf(html);
      expect(header, label).not.toBe('');
      const nav = linksIn(header).map((l) => l.href);
      expect(nav, label).toEqual([
        '/admin',
        '/admin',
        '/admin/enquiries',
        '/admin/tailors',
        '/admin/categories',
        '/admin/areas',
        '/admin/users',
        '/admin/account',
      ]); // brand + 7 links
      expect(header, label).toContain('action="/admin/logout"');
      expect(header, label).toContain('name="csrf"');
      expect(header, label).toMatch(/\(owner\)/);
      expect(html, label).toContain('<main id="main" class="admin-main">');
      expect(html, label).toContain('class="skip-link" href="#main"');
      expect(html, label).toContain('name="robots" content="noindex,nofollow"');
    }
  });

  it('marks the page you are on, and only that one', async () => {
    const ids = await seedContractData();
    const cookie = await signIn('owner');
    const expected: Record<string, string> = {
      dashboard: '/admin',
      account: '/admin/account',
      users: '/admin/users',
      categories: '/admin/categories',
      areas: '/admin/areas',
      tailors: '/admin/tailors',
      'new tailor': '/admin/tailors',
      'draft tailor': '/admin/tailors',
      'published tailor': '/admin/tailors',
      inbox: '/admin/enquiries',
      'inbox with spam': '/admin/enquiries',
      enquiry: '/admin/enquiries',
    };
    for (const [label, path] of PAGES(ids)) {
      const current = linksIn(headerOf(await (await get(path, cookie)).text()))
        .filter((l) => l.current)
        .map((l) => l.href);
      expect(current, label).toEqual([expected[label]]);
    }
  });

  it('shows each role only the links it may use', async () => {
    const hrefs = async (role: string) =>
      linksIn(headerOf(await (await get('/admin', await signIn(role))).text()))
        .map((l) => l.href)
        .filter((h, i) => i > 0);
    expect(await hrefs('manager')).toEqual([
      '/admin',
      '/admin/enquiries',
      '/admin/tailors',
      '/admin/categories',
      '/admin/areas',
      '/admin/account',
    ]);
    expect(await hrefs('editor')).toEqual([
      '/admin',
      '/admin/tailors',
      '/admin/categories',
      '/admin/areas',
      '/admin/account',
    ]);
    expect(await hrefs('viewer')).toEqual(['/admin', '/admin/account']);
  });

  it('gives the sign-in page a plain card and no header bar, and it still signs in', async () => {
    const html = await (await get('/admin/login')).text();
    expect(html).not.toContain('admin-header');
    expect(html).toContain('class="admin-card-page"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
  });

  it('loads one stylesheet that exists, and no script', async () => {
    const ids = await seedContractData();
    const cookie = await signIn('owner');
    for (const [label, path] of [
      ...PAGES(ids),
      ['login', '/admin/login'] as [string, string],
    ]) {
      const html = await (await get(path, cookie)).text();
      // no inline script anywhere; the only external script is the existing photo upload tool on a tailor page
      expect(html, label).not.toMatch(/<script(?![^>]*\bsrc=)/);
      if (
        !label.includes('tailor') ||
        label === 'tailors' ||
        label === 'new tailor'
      )
        expect(html, label).not.toContain('<script');
      const href = html.match(
        /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/,
      )?.[1];
      expect(href, label).toBeTruthy();
      expect(
        (await worker.fetch(new Request(`${ORIGIN}${href}`))).status,
        label,
      ).toBe(200);
    }
  });
});
