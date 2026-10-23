import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';
import { violationsOf } from './axe';

declare const Buffer: { from(text: string, encoding: string): never }; // no @types/node in this project

const FILL_DELAY = 3200;

// The whole tailor journey, with fake data: join, the owner approves, the tailor accepts the invite, fills in the page, adds a photo and says it is ready.
test('a tailor joins, is approved, fills in their page, adds a photo and asks for review (FR-TPO-01 to FR-TPO-07)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/join');
  await page.locator('#name').fill('E2E Portal Applicant');
  await page.locator('#phone').fill('7712 3499');
  await page.locator('#consent').check();
  await page.waitForTimeout(FILL_DELAY);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/join\/thanks\?ref=JN-/);

  await signIn(page);
  await page.goto('/admin/interest');
  const row = page.locator('article', { hasText: 'E2E Portal Applicant' });
  await row
    .getByRole('button', { name: 'Approve and make sign-in link' })
    .click();
  await expect(
    page.getByRole('heading', {
      name: /Sign-in link for E2E Portal Applicant/,
    }),
  ).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);
  const link = await page.getByLabel('Link').inputValue();
  expect(link).toContain('/portal/accept?token=');

  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  expect(await violationsOf(page)).toEqual([]);
  await page.getByLabel('Email').fill('e2e-portal@example.test');
  await page.getByLabel(/Choose a password/).fill('a-long-fake-e2e-passphrase');
  await page.getByLabel(/I agree that Alfaiate TL may show/).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(
    page.getByRole('heading', { name: /E2E Portal Applicant/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /My page is ready/ }),
  ).toBeDisabled();
  expect(await violationsOf(page)).toEqual([]);

  await page.getByRole('link', { name: 'About you', exact: true }).click();
  await page
    .getByLabel('About your work')
    .fill('I make fake shirts for tests.');
  await page.getByLabel('WhatsApp number').fill('7712 3499');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);

  await page.getByRole('link', { name: 'What you make', exact: true }).click();
  await page.locator('input[name^="cat_"]').first().check();
  await page.locator('input[name^="shop_"]').first().check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);

  await page.getByRole('link', { name: 'Photos', exact: true }).click();
  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#336699';
    context.fillRect(0, 0, 1600, 1200);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = '';
    for (const b of bytes) text += String.fromCharCode(b);
    return btoa(text);
  });
  await page.locator('#photo-file').setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await page
    .getByLabel(/Describe the photo/)
    .first()
    .fill('A plain blue fake shirt');
  await page.getByLabel(/These are photos of my own work/).check();
  await page.getByRole('button', { name: 'Add photo' }).click();
  await expect(page.getByText(/Photo added/)).toBeVisible();
  await expect(page.getByText('Waiting for the team')).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);

  // Shop S4: the tailor drafts a product of their own; Alfaiate TL publishes it.
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  expect(await violationsOf(page)).toEqual([]);
  await page.getByLabel('Product name').fill('E2E Portal Scarf');
  await page
    .getByLabel(/Description/)
    .fill('A made-up scarf from the browser test.');
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Portal Scarf' }),
  ).toBeVisible();
  await expect(page.getByText('This product is a draft.')).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);
  await page.goto('/portal');

  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: /My page is ready/ }).click();
  await expect(page.getByText('Thank you. We have been told')).toBeVisible();
  await expect(
    page.getByText('Waiting for the team to look at your page.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/portal\/login$/);
  await page.getByLabel('Email').fill('e2e-portal@example.test');
  await page.getByLabel('Password').fill('a-long-fake-e2e-passphrase');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/portal$/);
});
