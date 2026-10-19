import { expect, test } from '@playwright/test';

// WCAG 1.4.10 (reflow at 320 CSS px, the same as 400% zoom of a 1280 px window) and 1.4.12 (text spacing): nothing scrolls sideways or gets clipped.
const PATHS = [
  '/',
  '/tailors',
  '/categories/placeholder-category-1',
  '/tailors/e2e-fake-tailor',
  '/request',
  '/join',
  '/tet/join',
  '/contact',
  '/business',
  '/tailors?q=a',
  '/request/thanks?ref=AT-ABCD2345',
  '/how-it-works',
  '/about',
  '/privacy',
  '/terms',
  '/no-such-page',
  '/tet/',
  '/tet/request',
  '/tet/tailors/e2e-fake-tailor',
];

test.describe('320 px reflow', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const path of PATHS)
    test(`no sideways scrolling on ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
});

test.describe('text spacing override (WCAG 1.4.12)', () => {
  test.use({ viewport: { width: 375, height: 812 }, bypassCSP: true });
  for (const path of PATHS)
    test(`nothing is clipped or overflows on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.addStyleTag({
        content:
          '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      const clipped = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            'a, button, label, h1, h2, h3, legend',
          ),
        ]
          .filter((el) => {
            const style = getComputedStyle(el);
            return (
              (style.overflow === 'hidden' || style.overflowX === 'hidden') &&
              el.scrollWidth > el.clientWidth + 1
            );
          })
          .map((el) => el.outerHTML.slice(0, 80)),
      );
      expect(clipped).toEqual([]);
    });
});
