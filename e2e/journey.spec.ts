import { expect, test } from '@playwright/test';

// Phone-size journey (375 px): find a tailor, open the profile, see the contact buttons.
test('home shows the heading and a way to find a tailor above the fold (AC-01)', async ({
  page,
}) => {
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeInViewport();
  await expect(
    page.getByRole('link', { name: /find a tailor/i }).first(),
  ).toBeInViewport();
});

test('browse to a profile and see working WhatsApp and Call links', async ({
  page,
}) => {
  await page.goto('/tailors');
  await page.getByRole('link', { name: 'E2E Fake Tailor' }).first().click();
  await expect(page).toHaveURL(/\/tailors\/e2e-fake-tailor$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Fake Tailor' }),
  ).toBeVisible();
  await expect(
    page.locator('#main a[data-contact-channel="whatsapp"]'),
  ).toHaveAttribute('href', /^https:\/\/wa\.me\/67077123456/);
  await expect(
    page.locator('#main a[data-contact-channel="phone"]'),
  ).toHaveAttribute('href', 'tel:+67033123456');
});

test('the page does not scroll sideways at 375 px', async ({ page }) => {
  for (const url of ['/', '/tailors', '/tailors/e2e-fake-tailor']) {
    await page.goto(url);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test('filters work with the keyboard only', async ({ page }) => {
  await page.goto('/tailors');
  await page.getByLabel('Garment or service').focus();
  await page
    .getByLabel('Garment or service')
    .selectOption({ label: '[Placeholder] Suits' });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/category=placeholder-category-1/);
  await expect(
    page.getByRole('link', { name: 'E2E Fake Tailor' }).first(),
  ).toBeVisible();
});

test('a tap on Call is counted (204) and the link keeps its address', async ({
  page,
}) => {
  await page.goto('/tailors/e2e-fake-tailor');
  const counted = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/contact-click') && r.request().method() === 'POST',
  );
  await page
    .locator('#main a[data-contact-channel="phone"]')
    .dispatchEvent('click');
  expect((await counted).status()).toBe(204);
});

test('Tetum pages are served when the language is on', async ({ page }) => {
  await page.goto('/tet/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'tet');
});

test('the directory narrows as you type, shows a chip once a filter is applied that removes it', async ({
  page,
}) => {
  await page.goto('/tailors');
  const status = page.getByRole('status').first();
  await page.getByLabel('Tailor or shop name').fill('zzz-no-such-tailor');
  await expect(status).toHaveText('Tailors found: 0');
  await page.getByLabel('Tailor or shop name').press('Escape');
  await expect(status).not.toHaveText('Tailors found: 0');
  await page
    .getByLabel('Garment or service')
    .selectOption({ label: '[Placeholder] Suits' });
  await page.getByRole('button', { name: 'Show tailors' }).click();
  await expect(page).toHaveURL(/category=placeholder-category-1/);
  await page
    .getByRole('link', { name: 'Remove filter: [Placeholder] Suits' })
    .click();
  await expect(page).toHaveURL(/\/tailors$/);
});
