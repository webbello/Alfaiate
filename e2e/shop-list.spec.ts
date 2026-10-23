import { expect, test } from '@playwright/test';

// The shop cart (the Handspark cart): quantity, price and subtotal; "Send request" opens the request form with the items and quantities named.
test('adds a product to the cart, changes the quantity, sees the subtotal, sends it to the request form and removes it', async ({
  page,
}) => {
  await page.goto('/shop/e2e-fake-shirt');
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  const panel = page.locator('[data-cart-panel][data-open]').first();
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'E2E Fake Shirt' }).first(),
  ).toBeVisible();
  await expect(panel.locator('[data-cart-total]')).toHaveText('$ 25.00 USD');
  await panel.getByLabel('Quantity of E2E Fake Shirt').fill('2');
  await panel.getByLabel('Quantity of E2E Fake Shirt').press('Tab');
  await expect(panel.locator('[data-cart-total]')).toHaveText('$ 50.00 USD');
  await expect(page.locator('[data-cart-count]').first()).toHaveText('2');
  // Shop items are ordered on WhatsApp: the order page shows the order and the WhatsApp button (it opens by itself after a moment).
  await panel.getByRole('button', { name: 'Order on WhatsApp' }).click();
  await expect(page).toHaveURL(/\/order$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your order is ready' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open WhatsApp' }),
  ).toHaveAttribute('href', /^https:\/\/wa\.me\/67077000001\?text=/);
  await expect(page.getByText(/E2E Fake Shirt/).first()).toBeVisible();
  await page.goto('/shop/e2e-fake-shirt');
  await page.locator('[data-cart-toggle]:visible').first().click();
  await page
    .getByRole('button', { name: 'Remove E2E Fake Shirt from my cart' })
    .click();
  await expect(page.locator('[data-cart-empty]:visible')).toBeVisible();
});

test('the shop page has the category drop-down and a card with a bag button', async ({
  page,
}) => {
  await page.goto('/shop');
  await expect(
    page.getByRole('navigation', { name: 'Product categories' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'E2E Fake Shirt' }).first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Add E2E Fake Shirt to cart' })
    .click();
  await expect(page.locator('[data-cart-count]').first()).toHaveText('1');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('Add to Cart opens the request form with the item', async ({ page }) => {
    await page.goto('/shop/e2e-fake-shirt');
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await expect(page).toHaveURL(
      /\/request\?id=e2e-fake-shirt&price=25&product=e2e-fake-shirt&quantity=1$/,
    );
    await expect(
      page.getByText(/You are asking about these shop items: E2E Fake Shirt/),
    ).toBeVisible();
  });
});
