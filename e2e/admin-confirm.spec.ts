import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';

// FR-ADM-17: the first button only asks; it opens and closes with the keyboard, and the Yes button is reachable next. Nothing is sent here (other tests use this tailor).
test('Unpublish asks first, by keyboard and by tap, and cancelling sends nothing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto('/admin/tailors');
  await page.getByRole('link', { name: 'E2E Fake Tailor' }).first().click();
  await page.getByRole('link', { name: 'Publishing' }).click(); // the page shows one section at a time
  const summary = page.locator('.confirm > summary', {
    hasText: /^Unpublish$/,
  });
  await expect(summary).toBeVisible();
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const yes = page.getByRole('button', { name: 'Yes, unpublish' });
  await expect(yes).toBeHidden();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Take this tailor’s page off the public site now?'),
  ).toBeVisible();
  await expect(yes).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(yes).toBeFocused();
  await summary.click(); // pressing the first button again cancels
  await expect(yes).toBeHidden();
  expect(page.url()).toMatch(/\/admin\/tailors\/\d+(#.*)?$/); // nothing was sent: still this page
});
