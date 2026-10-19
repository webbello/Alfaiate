import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// AC-14 / NFR-A11Y: no axe violations on any kind of public page, in both languages, at phone width.
const PATHS = [
  '/',
  '/tailors',
  '/categories/placeholder-category-1',
  '/tailors/e2e-fake-tailor',
  '/request',
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
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual(
        [],
      );
    });
  }
}
