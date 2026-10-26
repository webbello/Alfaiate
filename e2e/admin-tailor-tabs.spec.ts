import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';
import { violationsOf } from './axe';

// One section at a time on a tailor's page: the first tab shows by default, a tab link shows its section, a link to a field opens the section that holds it,
// a save returns to its own tab, and the work tab uses two columns on a laptop.
test('the tailor page shows one tab at a time, opens the right one from a link or a save', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await page.goto('/admin/tailors');
  await page.getByRole('link', { name: 'E2E Fake Tailor' }).first().click();
  const url = page.url().replace(/#.*$/, '');
  await expect(page.locator('#tab-details')).toBeVisible();
  await expect(page.locator('#tab-photos')).toBeHidden();
  expect(await violationsOf(page)).toEqual([]);

  await page.getByRole('link', { name: 'Work and areas' }).click();
  await expect(page.locator('#tab-work')).toBeVisible();
  await expect(page.locator('#tab-details')).toBeHidden();
  const [a, b] = await page.locator('#tab-work section.card').all();
  const boxA = (await a!.boundingBox())!;
  const boxB = (await b!.boundingBox())!;
  expect(
    Math.abs(boxA.y - boxB.y),
    'categories and areas side by side on a laptop',
  ).toBeLessThan(4);
  expect(await violationsOf(page)).toEqual([]);

  for (const [name, id] of [
    ['Photos', 'tab-photos'],
    ['Publishing', 'tab-publish'],
    ['More', 'tab-more'],
  ] as const) {
    await page.getByRole('link', { name }).click();
    await expect(page.locator(`#${id}`)).toBeVisible();
    expect(await violationsOf(page), name).toEqual([]);
  }

  // a link to a field inside a tab opens that tab
  await page.goto(`${url}#permission-note`);
  await expect(page.locator('#tab-publish')).toBeVisible();
  await expect(page.locator('#tab-details')).toBeHidden();

  // a save returns to the tab it was made on (the address after the redirect has no tab in it)
  await page.goto(`${url}#tab-more`);
  await page.locator('#note-body').fill('Tabs fake note');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.locator('#tab-more')).toBeVisible();
  await expect(page.locator('#tab-details')).toBeHidden();
  await expect(page.getByText('Tabs fake note')).toBeVisible();
});

test('on a phone no tab scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto('/admin/tailors');
  await page.getByRole('link', { name: 'E2E Fake Tailor' }).first().click();
  for (const name of [
    'Details',
    'Work and areas',
    'Photos',
    'Publishing',
    'More',
  ]) {
    await page.getByRole('link', { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name,
    ).toBe(true);
  }
});
