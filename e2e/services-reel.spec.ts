import { expect, test } from '@playwright/test';

// The "Our services" section is a reel: it pins while the reader scrolls and the heading, counter and photos step through the five slides (four services, then the shop)
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
    expect(
      await section.evaluate((e) => e.getBoundingClientRect().height),
    ).toBeGreaterThan(height * 2);
    expect(await sticky.evaluate((e) => getComputedStyle(e).position)).toBe(
      'sticky',
    );
    const top = await section.evaluate(
      (e) => e.getBoundingClientRect().top + scrollY,
    );
    // the pinned stretch: the track minus one screen (shorter on phones since the UX audit, 2026-11-12)
    const track =
      (await section.evaluate((e) => e.getBoundingClientRect().height)) -
      height;
    const state = () =>
      page.evaluate(() => {
        const t = document
          .querySelector('.works-title-wrap')!
          .getBoundingClientRect().top;
        const first = document
          .querySelector('.works-thumb-wrap')!
          .getBoundingClientRect();
        return {
          stickyTop: Math.round(
            document.querySelector('.works-sticky')!.getBoundingClientRect()
              .top,
          ),
          titles: Math.round(t),
          firstPhotoLeft: Math.round(first.left),
        };
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

    // The first slide's button goes to the services; on the last slide (the shop) the same button goes to the shop.
    const button = page.locator('.works-button-block');
    expect(await button.getAttribute('href')).toBe('/services');
    await page.evaluate((y) => scrollTo(0, y), top + track - 10);
    await expect(button).toHaveAttribute('href', '/shop');
    await expect(button).toContainText('Visit the Shop');
    // the heading has stepped a whole row: the last title sits exactly in its window
    await expect
      .poll(() =>
        page.evaluate(() => {
          const block = document
            .querySelector('.works-title-block')!
            .getBoundingClientRect();
          const last = [...document.querySelectorAll('.works-title')]
            .at(-1)!
            .getBoundingClientRect();
          return Math.abs(last.top - block.top) < 2;
        }),
      )
      .toBe(true);
    await page.evaluate((y) => scrollTo(0, y), top);
    await expect(button).toHaveAttribute('href', '/services');

    // At every step through the section a slide covers a good part of the viewport and is already loaded (no blank frame, even after a jump).
    for (let i = 0; i <= 8; i++) {
      await page.evaluate((y) => scrollTo(0, y), top + (i * (track - 10)) / 8);
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              [
                ...document.querySelectorAll<HTMLImageElement>('.works-thumb'),
              ].some((im) => {
                const r = im.getBoundingClientRect();
                const seen =
                  Math.max(
                    0,
                    Math.min(r.right, innerWidth) - Math.max(r.left, 0),
                  ) *
                  Math.max(
                    0,
                    Math.min(r.bottom, innerHeight) - Math.max(r.top, 0),
                  );
                return (
                  im.complete &&
                  im.naturalWidth > 0 &&
                  seen > 0.3 * innerWidth * innerHeight
                );
              }),
            ),
          { message: `a loaded slide is in view at step ${i}`, timeout: 1500 },
        )
        .toBe(true);
    }
  });
}
