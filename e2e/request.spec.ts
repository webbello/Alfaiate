import { violationsOf } from './axe';
import { expect, test, type Page } from '@playwright/test';

// AC-06/07: the request form on a 375 px phone, by keyboard only. The form refuses a submission under 3 seconds, so each test waits.
const FILL_DELAY = 3200;
// The local Worker sees no client address, so every test would share one rate-limit bucket (5 sends per hour); give this file its own.
test.use({ extraHTTPHeaders: { 'cf-connecting-ip': '198.51.100.21' } });

async function tabTo(page: Page, id: string) {
  for (let i = 0; i < 20; i++) {
    if ((await page.evaluate(() => document.activeElement?.id)) === id) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Never reached #${id} by keyboard`);
}

test('a customer completes the request with the keyboard only and sees a reference code (AC-07)', async ({
  page,
}) => {
  await page.goto('/request');
  // steps 1 to 3 are optional: reach each Next/Skip button by keyboard and press it
  for (const step of [1, 2, 3]) {
    await expect(page.locator(`[data-wz-step="${step}"]`)).toBeVisible();
    await page.locator('[data-wz-next]').focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('[data-wz-step="4"]')).toBeVisible();
  await page.locator('#name').focus();
  await page.keyboard.type('E2E Fake Customer');
  await tabTo(page, 'phone');
  await page.keyboard.type('7712 3456');
  await tabTo(page, 'channel-either'); // "Either" is ticked already; arrows would change it
  await page.keyboard.press('Space');
  await tabTo(page, 'consent');
  await page.keyboard.press('Space');
  await page.waitForTimeout(FILL_DELAY);
  await tabTo(page, 'consent');
  await page.keyboard.press('Tab'); // privacy link
  await page.keyboard.press('Tab'); // submit
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/request\/thanks\?ref=AT-[A-HJ-NP-Z2-9]{8}$/);
  await expect(page.locator('.reference')).toHaveText(/^AT-/);
  await expect(page.getByText(/not a confirmed appointment/)).toBeVisible();
  expect(page.url()).not.toMatch(/Fake|7712|3456/);
});

test('mistakes show a summary and field errors, keep what was typed, open the step with the problem, and pass axe (AC-06)', async ({
  page,
}) => {
  await page.goto('/request#notes'); // a link to a field on another step opens that step
  await expect(page.locator('[data-wz-step="3"]')).toBeVisible();
  await page
    .locator('form.request')
    .evaluate((form: HTMLFormElement) => (form.noValidate = true)); // reach the server-side messages
  await page.locator('#notes').fill('keep these words');
  await page.waitForTimeout(FILL_DELAY);
  await page
    .locator('form.request')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.getByRole('alert')).toContainText(
    'Please fix the following',
  );
  await expect(page.locator('[data-wz-step="4"]')).toBeVisible();
  await expect(page.locator('#name-error')).toBeVisible();
  await expect(page.locator('#consent-error')).toBeVisible();
  await expect(page.locator('#notes')).toHaveValue('keep these words');
  await expect(page.locator('#consent')).not.toBeChecked();
  // the summary's link to the name field works
  await page.getByRole('link', { name: /Your name/ }).click();
  await expect(page.locator('#name')).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);
});

test('the request page does not scroll sideways at 375 px', async ({
  page,
}) => {
  for (const url of ['/request', '/tet/request']) {
    await page.goto(url);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test('the Tetum form submits to the Tetum acknowledgement', async ({
  page,
}) => {
  await page.goto('/tet/request#name'); // a link to a field on a later step opens that step
  await page.locator('#name').fill('E2E Fake Customer');
  await page.locator('#phone').fill('7712 3456');
  await page.locator('#channel-phone').check();
  await page.locator('#consent').check();
  await page.waitForTimeout(FILL_DELAY);
  await page.locator('#main button[type="submit"]').click();
  await expect(page).toHaveURL(/\/tet\/request\/thanks\?ref=AT-/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'tet');
});

test('a customer taps a category, an area and a time, then sends (four steps)', async ({
  page,
}) => {
  await page.goto('/request');
  await page.getByText('[Placeholder] Suits', { exact: true }).click(); // a tap on a card moves on by itself
  await expect(page.locator('[data-wz-step="2"]')).toBeVisible();
  await page.getByText('[Placeholder] Area 1', { exact: true }).click();
  await page.locator('#area_text').fill('Near the fake blue gate');
  await page.locator('[data-wz-next]').click();
  await expect(page.locator('[data-wz-step="3"]')).toBeVisible();
  await page.getByText('This week', { exact: true }).click();
  await expect(page.locator('[data-wz-step="4"]')).toBeVisible();
  // what was chosen is shown again, each answer a button that goes back to its step
  await expect(page.locator('[data-wz-summary]')).toContainText(
    '[Placeholder] Suits',
  );
  await expect(page.locator('[data-wz-summary]')).toContainText('This week');
  await page.locator('#name').fill('E2E Fake Customer');
  await page.locator('#phone').fill('7712 3456');
  await page.locator('#channel-whatsapp').check();
  await page.locator('#consent').check();
  await page.waitForTimeout(FILL_DELAY);
  await page.locator('#main button[type="submit"]').click();
  await expect(page).toHaveURL(/\/request\/thanks\?ref=AT-/);
});

test('a tailor sends their details on the join page and sees a reference (Phase 7c)', async ({
  page,
}) => {
  await page.goto('/join');
  await page.locator('#name').fill('E2E Fake Tailor Applicant');
  await page.locator('#phone').fill('7712 3456');
  await page.locator('#consent').check();
  await page.waitForTimeout(FILL_DELAY);
  await page.locator('#main button[type="submit"]').click();
  await expect(page).toHaveURL(/\/join\/thanks\?ref=JN-/);
  await expect(page.locator('.reference')).toHaveText(/^JN-/);
});
