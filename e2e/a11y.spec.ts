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
      if (url.includes('theme-preview')) await page.waitForTimeout(2500);
      expect(await violationsOf(page)).toEqual([]);
    });
  }
}
