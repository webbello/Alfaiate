import { expect, test } from '@playwright/test';

// Handspark theme step 4: the request list. Add a tailor from the directory, see it in the panel, send it to the request form.
test('adds a tailor to the request list and sends the list to the request form', async ({
  page,
}) => {
  await page.goto('/tailors');
  await page
    .getByRole('button', { name: 'Add E2E Fake Tailor to my request list' })
    .first()
    .click();
  const panel = page.locator('[data-cart-panel][data-open]').first();
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'E2E Fake Tailor' }).first(),
  ).toBeVisible();
  await expect(page.locator('[data-cart-count]').first()).toHaveText('1');
  await panel.getByRole('link', { name: 'Send request' }).click();
  await expect(page).toHaveURL(/\/request\?tailor=e2e-fake-tailor$/);
  await expect(page.locator('input[name="tailor"]')).toHaveValue(
    'e2e-fake-tailor',
  );
});

test('removes a tailor from the list again', async ({ page }) => {
  await page.goto('/tailors/e2e-fake-tailor');
  await page
    .getByRole('button', { name: 'Add to request list' })
    .first()
    .click();
  const panel = page.locator('[data-cart-panel][data-open]').first();
  await panel
    .getByRole('button', { name: /^Remove/ })
    .first()
    .click();
  await expect(panel.locator('[data-cart-empty]')).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the add button opens the request form for that tailor', async ({
    page,
  }) => {
    await page.goto('/tailors');
    await page
      .getByRole('button', { name: 'Add E2E Fake Tailor to my request list' })
      .first()
      .click();
    await expect(page).toHaveURL(/\/request\?tailor=e2e-fake-tailor$/);
  });
});
