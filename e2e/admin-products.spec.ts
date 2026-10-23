import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';
import { violationsOf } from './axe';

// Shop S1: the product admin pages work with a keyboard-friendly form and pass axe (WCAG 2.2 AA).
test('add, publish and list a product, with no axe violations on the three pages', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/admin/products');
  expect(await violationsOf(page)).toEqual([]);
  await page.getByRole('link', { name: 'Add a product' }).click();
  expect(await violationsOf(page)).toEqual([]);
  await page.getByLabel('Product name').fill('E2E Fake Scarf');
  await page
    .getByLabel('Description (needed to publish)')
    .fill('A made-up scarf for the browser test.');
  await page.getByLabel(/Price in US dollars/).fill('18.50');
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Fake Scarf' }),
  ).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published.').first()).toBeVisible();
  await page.goto('/admin/products');
  await expect(
    page.getByRole('link', { name: 'E2E Fake Scarf' }),
  ).toBeVisible();
});
