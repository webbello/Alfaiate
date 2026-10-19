import { expect, test } from '@playwright/test';
import { violationsOf } from './axe';

// Phase 7c T3: with reduced motion the hero is still and flat; otherwise the swatch is in 3D and moves.
test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('nothing animates', async ({ page }) => {
    await page.goto('/');
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('.hero *')]
        .map((e) => getComputedStyle(e).animationName)
        .filter((n) => n !== 'none'),
    );
    expect(names).toEqual([]);
  });
});

test.describe('normal motion', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('the swatch is a 3D scene and the page is accessible', async ({
    page,
  }) => {
    await page.goto('/');
    const style = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.swatch')!);
      return { transformStyle: s.transformStyle, animation: s.animationName };
    });
    expect(style.transformStyle).toBe('preserve-3d');
    expect(style.animation).not.toBe('none');
    expect(await violationsOf(page)).toEqual([]);
  });
});
