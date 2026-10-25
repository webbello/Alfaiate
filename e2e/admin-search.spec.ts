import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';
import { violationsOf } from './axe';

// FR-ADM-14: the top-bar search reaches a request and a tailor, on a laptop and on a phone, and the results page has no axe violations.
for (const [width, height] of [
  [1280, 800],
  [375, 812],
] as const) {
  test(`the top bar search finds a request and a tailor (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await signIn(page);
    const box = page.getByRole('searchbox', {
      name: 'Search requests, tailors and orders',
    });
    await box.fill('AT-E2EFAKE2');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/admin\/search$/);
    await expect(page.getByRole('link', { name: 'AT-E2EFAKE2' })).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);
    await page
      .getByRole('searchbox', { name: 'Search', exact: true })
      .fill('E2E Fake Tailor');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'E2E Fake Tailor' }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
