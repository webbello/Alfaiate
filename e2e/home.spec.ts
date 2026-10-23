import { expect, test } from '@playwright/test';
import { violationsOf } from './axe';

// Phase 7d: the reference-design home page in a browser: phone menu, reduced motion, layout at phone and desktop widths.
test.describe('phone menu', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('opens and closes with the button and Escape, and shows the links when open', async ({
    page,
  }) => {
    await page.goto('/');
    const toggle = page.locator('.nav-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#site-menu')).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: 'For Businesses' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    expect(await violationsOf(page)).toEqual([]);
  });
  test('the heading, the request button and the disclaimer are on the first screen (AC-01)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.locator('.hero .button--accent')).toBeInViewport();
    await expect(page.locator('.hero__note')).toBeInViewport();
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('shows the menu without a toggle, the hero photo beside the copy, and eight services in one row', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.nav-toggle')).toBeHidden();
    await expect(page.locator('#site-menu')).toBeVisible();
    const copy = await page.locator('.hero__text').boundingBox();
    const photo = await page.locator('.hero__image').boundingBox();
    // the photo bleeds to the right edge and its soft left edge overlaps the copy column (the feather), as in the reference
    expect(photo!.x + photo!.width).toBeGreaterThanOrEqual(1439);
    expect(photo!.x).toBeGreaterThan(1440 * 0.3);
    expect(copy!.x).toBeLessThan(photo!.x);
    const tops = await page
      .locator('.service-card')
      .evaluateAll((cards) =>
        cards.map((c) => Math.round(c.getBoundingClientRect().top)),
      );
    expect(new Set(tops).size).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  for (const path of ['/', '/tailors', '/request', '/join', '/how-it-works']) {
    test(`no animation and no 3D transform on ${path}`, async ({ page }) => {
      await page.goto(path);
      const moving = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter((e) => {
            const s = getComputedStyle(e);
            return (
              s.animationName !== 'none' || s.transform.startsWith('matrix3d')
            );
          })
          .map((e) => e.className || e.tagName),
      );
      expect(moving).toEqual([]);
    });
  }
});
