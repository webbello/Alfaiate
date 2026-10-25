import { expect, test } from '@playwright/test';
import { violationsOf } from './axe';

// The four-step request page: every step passes axe at phone widths, the fixed button never covers the field being used, browser Back moves one step,
// the answers come back as buttons, Tetum has its own words, and with JavaScript off the steps stack and the form still sends.
test.use({ extraHTTPHeaders: { 'cf-connecting-ip': '198.51.100.31' } });
const FILL_DELAY = 3200;

for (const [width, height] of [
  [375, 812],
  [320, 640],
] as const) {
  test(`each step passes axe, fits the screen and keeps its field clear of the button (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/request');
    for (const step of [1, 2, 3, 4]) {
      const section = page.locator(`[data-wz-step="${step}"]`);
      await expect(section).toBeVisible();
      await expect(page.locator('[data-wz-count]')).toHaveText(
        `Step ${step} of 4`,
      );
      expect(await violationsOf(page), `axe on step ${step}`).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `no sideways scroll on step ${step}`,
      ).toBe(true);
      const button =
        step < 4
          ? page.locator('[data-wz-next]')
          : page.locator('[data-wz-send]');
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.height, 'big button').toBeGreaterThanOrEqual(48);
      expect(
        box.y + box.height,
        'button inside the screen',
      ).toBeLessThanOrEqual(height);
      if (step < 4) await page.locator('[data-wz-next]').click();
    }
    // the last field is not hidden behind the fixed button when it gets focus
    await page.locator('#consent').focus();
    const field = (await page.locator('#consent').boundingBox())!;
    const bar = (await page.locator('.wz-bar').boundingBox())!;
    expect(field.y + field.height).toBeLessThanOrEqual(bar.y + 1);
  });
}

test('picking a card moves on, Back and the browser Back return one step, and answers come back as buttons', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/request');
  await expect(page.locator('[data-wz-back]')).toBeHidden();
  await page.getByText('[Placeholder] Dresses', { exact: true }).click();
  await expect(page.locator('[data-wz-step="2"]')).toBeVisible();
  await expect(page.locator('[data-wz-back]')).toBeVisible();
  await page.goBack(); // the browser's Back goes to step 1, not off the page
  await expect(page.locator('[data-wz-step="1"]')).toBeVisible();
  await expect(page).toHaveURL(/\/request/);
  await page.locator('[data-wz-next]').click(); // the choice is kept; the button now says Next
  await page.getByText('[Placeholder] Area 2', { exact: true }).click();
  await page.locator('[data-wz-next]').click();
  await page.getByText('I am flexible', { exact: true }).click();
  const summary = page.locator('[data-wz-summary]');
  await expect(summary).toContainText('[Placeholder] Dresses');
  await expect(summary).toContainText('[Placeholder] Area 2');
  await summary.getByRole('button', { name: /Dresses/ }).click();
  await expect(page.locator('[data-wz-step="1"]')).toBeVisible();
  await expect(page.locator('#wz-h1')).toBeFocused();
});

test('the Tetum page has its own step words', async ({ page }) => {
  await page.goto('/tet/request');
  await expect(page.locator('[data-wz-count]')).toHaveText('Pasu 1 husi 4');
  await expect(page.locator('[data-wz-next]')).toHaveText(/Liu|Tuir mai/);
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });
  test('the four steps stack and the form still sends', async ({ page }) => {
    await page.goto('/request');
    for (const step of [1, 2, 3, 4])
      await expect(page.locator(`[data-wz-step="${step}"]`)).toBeVisible();
    await expect(page.locator('[data-wz-next]')).toBeHidden();
    await page.locator('#name').fill('E2E Fake Customer');
    await page.locator('#phone').fill('7712 3456');
    await page.locator('#consent').check();
    await page.waitForTimeout(FILL_DELAY);
    await page.locator('[data-wz-send]').click();
    await expect(page).toHaveURL(/\/request\/thanks\?ref=AT-/);
  });
});
