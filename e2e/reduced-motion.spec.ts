import { expect, test } from '@playwright/test';
import { violationsOf } from './axe';

// With a reduced-motion preference the motion script plays nothing, so the services section must still show all four services and be readable.
test.use({ reducedMotion: 'reduce' });
for (const [width, height] of [
  [375, 812],
  [1280, 800],
] as const) {
  test(`services section lists every service without motion (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const titles = page.locator('.our-works-section .works-title');
    await expect(titles).toHaveCount(5);
    for (let i = 0; i < 5; i++) await expect(titles.nth(i)).toBeVisible();
    const box = await titles.nth(4).boundingBox();
    expect(box && box.height).toBeGreaterThan(10);
    await page.waitForTimeout(500);
    expect(await violationsOf(page)).toEqual([]);
  });
}
