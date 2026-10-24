import { expect, test } from '@playwright/test';
import { violationsOf } from './axe';

// The footer is a compact block, not a screenful of empty space (it was about 985 px tall on a laptop and 1580 px on a phone).
for (const [name, size, max] of [
  ['laptop', { width: 1280, height: 800 }, 450],
  ['phone', { width: 375, height: 812 }, 700],
] as const) {
  test(`the footer stays compact on a ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/about');
    const footer = page.locator('footer.footer-section');
    const height = await footer.evaluate(
      (e) => e.getBoundingClientRect().height,
    );
    expect(height).toBeLessThanOrEqual(max);
    await expect(
      footer.getByRole('link', { name: 'Privacy Policy' }),
    ).toBeVisible();
    await expect(footer.getByLabel('Email address')).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);
  });
}
