import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';
import { violationsOf } from './axe';

// FR-ADM-16: on a phone the request list is cards (no table), each with a big message button; a request opens with large actions and one-tap status chips.
test('a request is a card on a phone and its status changes with one tap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto('/admin/enquiries');
  await expect(page.locator('.req-cards')).toBeVisible();
  await expect(page.locator('.req-table')).toBeHidden();
  const first = page.locator('.req-card').first();
  expect(
    (await first.locator('.req-card__ref').boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await violationsOf(page)).toEqual([]);

  await first.locator('.req-card__ref').click();
  const actions = page.locator('.req-actions');
  await expect(actions).toBeVisible();
  for (const control of await actions.locator('.req-big, .status-chip').all())
    expect(
      (await control.boundingBox())!.height,
      'touch size',
    ).toBeGreaterThanOrEqual(44);
  expect(await violationsOf(page)).toEqual([]);
  await actions.getByRole('button', { name: 'Contacted' }).click();
  await expect(
    page.locator('.req-actions').getByRole('button', { name: 'Contacted' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('status').or(page.locator('.flash')).first(),
  ).toContainText(/Done|saved/i);
  await page
    .locator('.req-actions')
    .getByRole('link', { name: 'Add a note' })
    .click();
  await expect(page).toHaveURL(/#note$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('on a laptop the list stays a table', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);
  await page.goto('/admin/enquiries');
  await expect(page.locator('.req-table')).toBeVisible();
  await expect(page.locator('.req-cards')).toBeHidden();
});
