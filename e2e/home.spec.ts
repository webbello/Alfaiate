import { expect, test } from '@playwright/test';
import { violationsOf } from './axe';

// Handspark theme home page in a browser (step 3): phone menu, the first screen, the hero image trail and ruler, reduced motion.
test.describe('phone menu', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('opens and closes with the button and Escape, and shows the links when open', async ({
    page,
  }) => {
    await page.goto('/');
    const toggle = page.locator('[data-nav-toggle]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-nav-menu]')).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page
        .locator('[data-nav-menu]')
        .getByRole('link', { name: 'Find a Tailor' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(2500);
    expect(await violationsOf(page)).toEqual([]);
  });
  test('the heading, the request button and the disclaimer are on the first screen (AC-01)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(
      page.locator('.home-button .is-coffee').first(),
    ).toBeInViewport();
    await expect(page.locator('.home-note').first()).toBeInViewport();
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('shows the menu row without a toggle, the ruler under the hero, and nothing that scrolls sideways', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('[data-nav-toggle]')).toBeHidden();
    await expect(
      page.locator('.header-menu-block.is-display-show-for-desktop'),
    ).toBeVisible();
    await expect(page.locator('.home-section .hero-line')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

  test('moving the pointer across the hero makes pictures appear and fade away (the image trail)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    for (const [x, y] of [
      [300, 420],
      [460, 440],
      [620, 420],
      [780, 440],
    ])
      await page.mouse.move(x, y, { steps: 6 });
    // pictures are added to the stage as the pointer travels and removed again when they have faded
    await expect
      .poll(() => page.locator('.gsap-wrapper .gsap-wrap').count())
      .toBeGreaterThan(1);
    const sources = await page
      .locator('.gsap-wrapper .gsap-wrap img')
      .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));
    for (const src of sources)
      expect(src).toMatch(/\/images\/site\/|placeholder/);
    await expect
      .poll(() => page.locator('.gsap-wrapper .gsap-wrap').count(), {
        timeout: 8000,
      })
      .toBeLessThanOrEqual(1);
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
