import { expect, test } from '@playwright/test';
import { violationsOf } from './axe';

// AC-14 / NFR-A11Y: no axe violations on any kind of public page, in both languages, at phone width.
const PATHS = [
  '/',
  '/tailors',
  '/categories/placeholder-category-1',
  '/tailors/e2e-fake-tailor',
  '/request',
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
      expect(await violationsOf(page)).toEqual([]);
    });
  }
}
