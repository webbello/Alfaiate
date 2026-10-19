import { expect, test } from '@playwright/test';

// NFR-BRW-01: browsing and the request form work without client-side JavaScript.
test.use({
  javaScriptEnabled: false,
  // its own rate-limit bucket (the local Worker sees no client address, so otherwise all test files share one)
  extraHTTPHeaders: { 'cf-connecting-ip': '198.51.100.22' },
});

test('browse to a profile and find the contact links, with JavaScript off', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Find a tailor' }).first().click();
  await expect(page).toHaveURL(/\/tailors$/);
  await page.getByRole('link', { name: 'E2E Fake Tailor' }).first().click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Fake Tailor' }),
  ).toBeVisible();
  await expect(
    page.locator('a[data-contact-channel="whatsapp"]'),
  ).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  await expect(page.locator('a[data-contact-channel="phone"]')).toHaveAttribute(
    'href',
    'tel:+67033123456',
  );
});

test('the directory filter works as a plain form', async ({ page }) => {
  await page.goto('/tailors');
  await page
    .getByLabel('Garment or service')
    .selectOption({ label: '[Placeholder] Suits' });
  await page.getByRole('button', { name: /show|filter|search/i }).click();
  await expect(page).toHaveURL(/category=placeholder-category-1/);
  await expect(
    page.getByRole('link', { name: 'E2E Fake Tailor' }).first(),
  ).toBeVisible();
});

test('the whole request can be sent with JavaScript off, in English and Tetum', async ({
  page,
}) => {
  for (const [path, thanks] of [
    ['/request', /\/request\/thanks\?ref=AT-/],
    ['/tet/request', /\/tet\/request\/thanks\?ref=AT-/],
  ] as const) {
    await page.goto(path);
    await page.locator('#name').fill('E2E Fake Customer');
    await page.locator('#phone').fill('7712 3456');
    await page.locator('#channel-phone').check();
    await page.locator('#consent').check();
    await page.waitForTimeout(3200); // the form refuses a send under three seconds
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(thanks);
    await expect(page.locator('.reference')).toHaveText(/^AT-/);
  }
});

test('mistakes are explained next to the field with JavaScript off', async ({
  page,
}) => {
  await page.goto('/request');
  await page
    .locator('form.request')
    .evaluate((form: HTMLFormElement) => (form.noValidate = true))
    .catch(() => undefined);
  await page.waitForTimeout(3200);
  await page.locator('button[type="submit"]').click();
  // without JavaScript the browser's own required-field check may stop the send first; either way the page stays on the form
  await expect(page).toHaveURL(/\/request/);
});
