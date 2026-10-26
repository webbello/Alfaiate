import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';
import { violationsOf } from './axe';

// A request page uses two columns on a laptop (customer and notes left, referrals right) and one on a phone; the full status list and spam switch are folded away.
test('the request page is two columns on a laptop and one on a phone', async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/admin/enquiries?q=AT-E2EFAKE2');
  await page.getByRole('link', { name: 'AT-E2EFAKE2' }).first().click();
  const left = (await page.locator('#customer-card').boundingBox())!;
  const right = (await page.locator('#status-card').boundingBox())!;
  const referrals = (await page.locator('#referrals').boundingBox())!;
  expect(
    referrals.x,
    'referrals sit to the right of the customer',
  ).toBeGreaterThan(left.x + left.width - 4);
  expect(
    Math.abs(right.y - left.y),
    'both columns start together',
  ).toBeLessThan(40);
  await expect(page.locator('#status')).toBeVisible(); // the full status list stays on the page
  expect(await violationsOf(page)).toEqual([]);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const phoneLeft = (await page.locator('#customer-card').boundingBox())!;
  const phoneRight = (await page.locator('#referrals').boundingBox())!;
  expect(
    phoneRight.y,
    'one column on a phone: referrals below the customer',
  ).toBeGreaterThan(phoneLeft.y + phoneLeft.height - 4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
