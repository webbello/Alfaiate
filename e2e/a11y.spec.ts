import { expect, test } from '@playwright/test';
import { violationsOf } from './axe';

// AC-14 / NFR-A11Y: no axe violations on any kind of public page, in both languages, at phone width.
const PATHS = [
  '/',
  '/tailors',
  '/categories/placeholder-category-1',
  '/tailors/e2e-fake-tailor',
  '/request',
  '/join',
  '/contact',
  '/theme-preview',
  '/journal',
  '/gallery',
  '/faq',
  '/services',
  '/portal/login',
  '/portal/accept?token=invalid',
  '/craft',
  '/business',
  '/newsletter',
  '/request/thanks?ref=AT-ABCD2345',
  '/how-it-works',
  '/about',
  '/privacy',
  '/terms',
  '/no-such-page',
];

for (const prefix of ['', '/tet']) {
  for (const path of PATHS) {
    const url = prefix ? (path === '/' ? '/tet/' : `/tet${path}`) : path;
    test(`axe: ${url}`, async ({ page }) => {
      await page.goto(url);
      // the theme's hero text fades in with GSAP: check the colours once it has settled
      if (
        url.includes('theme-preview') ||
        url.includes('/tailors') ||
        /\/(journal|gallery|faq)$/.test(url) ||
        url === '/' ||
        url === '/tet/'
      )
        await page.waitForTimeout(2500);
      expect(await violationsOf(page)).toEqual([]);
    });
  }
}

// The theme's wide layout (header menu row, language switch) has its own markup: check it too.
test.describe('wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  for (const url of [
    '/',
    '/tailors',
    '/about',
    '/tet/',
    '/tailors/e2e-fake-tailor',
  ]) {
    test(`axe at 1280px: ${url}`, async ({ page }) => {
      await page.goto(url);
      await page.waitForTimeout(2500);
      expect(await violationsOf(page)).toEqual([]);
    });
  }
});
