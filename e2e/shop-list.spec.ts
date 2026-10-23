import { expect, test } from '@playwright/test';

// Shop S3: the shop list (separate from the tailor request list) and the product enquiry through the request form.
test('adds an item to the shop list, sees it, sends the enquiry to the request form, and removes it', async ({
  page,
}) => {
  await page.goto('/shop/e2e-fake-shirt');
  await page.getByRole('button', { name: 'Add to my shop list' }).click();
  const box = page.locator('[data-product-list]');
  await expect(box).toBeVisible();
  await expect(box.getByRole('link', { name: 'E2E Fake Shirt' })).toBeVisible();
  await box.getByRole('link', { name: 'Send an enquiry' }).click();
  await expect(page).toHaveURL(/\/request\?product=e2e-fake-shirt$/);
  await expect(
    page.getByText(/You are asking about these shop items: E2E Fake Shirt/),
  ).toBeVisible();
  await expect(page.locator('input[name="product"]')).toHaveValue(
    'e2e-fake-shirt',
  );
  await page.goto('/shop/e2e-fake-shirt');
  await page
    .getByRole('button', { name: 'Remove E2E Fake Shirt from my shop list' })
    .click();
  await expect(page.locator('[data-product-list]')).toBeHidden();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the add button opens the request form with the item', async ({
    page,
  }) => {
    await page.goto('/shop/e2e-fake-shirt');
    await page.getByRole('button', { name: 'Add to my shop list' }).click();
    await expect(page).toHaveURL(/\/request\?product=e2e-fake-shirt$/);
  });
});
