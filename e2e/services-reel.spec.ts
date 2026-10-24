import { expect, test } from '@playwright/test';

// The "Our services" section is a reel: it pins while the reader scrolls and the heading, counter and photos step through the four services
// (motion layer, AGENTS.md lesson 2026-10-23). Without the motion script, or with JavaScript off, a plain list shows instead (reduced-motion.spec, below).
for (const [width, height] of [
  [375, 812],
  [1280, 800],
] as const) {
  test(`services section pins and steps through the slides while scrolling (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const section = page.locator('.works-height');
    const sticky = page.locator('.works-sticky');
    // a tall track with a sticky stage, not the plain list
    expect(await section.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(height * 2);
    expect(await sticky.evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
    const top = await section.evaluate((e) => e.getBoundingClientRect().top + scrollY);
    const state = () =>
      page.evaluate(() => {
        const t = document.querySelector('.works-title-wrap')!.getBoundingClientRect().top;
        const first = document.querySelector('.works-thumb-wrap')!.getBoundingClientRect();
        return { stickyTop: Math.round(document.querySelector('.works-sticky')!.getBoundingClientRect().top), titles: Math.round(t), firstPhotoLeft: Math.round(first.left) };
      });
    await page.evaluate((y) => scrollTo(0, y), top);
    await page.waitForTimeout(300);
    const start = await state();
    // after scrolling about one and a half screens the stage is still pinned and the slides have moved on
    await page.evaluate((y) => scrollTo(0, y), top + height * 1.6);
    await page.waitForTimeout(500);
    const later = await state();
    expect(later.stickyTop).toBe(start.stickyTop);
    expect(later.titles).toBeLessThan(start.titles);
    expect(later.firstPhotoLeft).toBeLessThan(start.firstPhotoLeft);
  });
}
