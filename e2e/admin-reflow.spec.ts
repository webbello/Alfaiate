import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';

// Phase 7b: WCAG 1.4.10 (reflow at 320 px) and 1.4.12 (text spacing) on the admin pages, plus a keyboard path through the header.
const PATHS = [
  '/admin',
  '/admin/enquiries',
  '/admin/tailors',
  '/admin/tailors/new',
  '/admin/categories',
  '/admin/areas',
  '/admin/users',
  '/admin/interest',
  '/admin/traffic',
  '/admin/account',
];

async function withDetailPages(page: import('@playwright/test').Page) {
  await page.goto('/admin/tailors');
  const tailor = await page
    .getByRole('link', { name: 'E2E Fake Tailor' })
    .first()
    .getAttribute('href');
  await page.goto('/admin/enquiries?q=AT-E2EFAKE2');
  const enquiry = await page
    .getByRole('link', { name: 'AT-E2EFAKE2' })
    .getAttribute('href');
  return [...PATHS, tailor!, enquiry!];
}

test.describe('admin at 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('no admin page scrolls sideways', async ({ page }) => {
    await signIn(page);
    const wide: string[] = [];
    for (const path of await withDetailPages(page)) {
      await page.goto(path);
      if (
        !(await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ))
      )
        wide.push(path);
    }
    expect(wide).toEqual([]);
  });
});

test.describe('admin text spacing (WCAG 1.4.12)', () => {
  test.use({ viewport: { width: 375, height: 812 }, bypassCSP: true });
  test('nothing overflows or is clipped on any admin page', async ({
    page,
  }) => {
    await signIn(page);
    const problems: string[] = [];
    for (const path of await withDetailPages(page)) {
      await page.goto(path);
      await page.addStyleTag({
        content:
          '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
      });
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        if (document.documentElement.scrollWidth > window.innerWidth + 1)
          out.push('sideways scroll');
        for (const el of document.querySelectorAll<HTMLElement>(
          'a, button, label, h1, h2, h3, legend, summary',
        )) {
          const s = getComputedStyle(el);
          if (
            (s.overflow === 'hidden' || s.overflowX === 'hidden') &&
            el.scrollWidth > el.clientWidth + 1
          )
            out.push(el.outerHTML.slice(0, 60));
        }
        return out;
      });
      for (const b of bad) problems.push(`${path}: ${b}`);
    }
    expect(problems).toEqual([]);
  });
});

test('the header can be used from the keyboard, in visual order, and marks the current page', async ({
  page,
}) => {
  await signIn(page);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to main content' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Alfaiate TL admin' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('navigation', { name: 'Admin' }).getByRole('link').first(),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter'); // the second link: Enquiries
  await expect(page).toHaveURL(/\/admin\/enquiries$/);
  await expect(
    page
      .getByRole('navigation', { name: 'Admin' })
      .locator('a[aria-current="page"]'),
  ).toHaveText('Enquiries');
});
