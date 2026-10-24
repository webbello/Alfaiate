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
  await page.locator('#main button[type="submit"]').click();
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
  await page
    .getByLabel('Email', { exact: true })
    .fill('e2e-portal@example.test');
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

  // The guided steps: each one says where the tailor is and "Save and next" moves on.
  await page.getByRole('link', { name: /Next step: Contact/ }).click();
  await expect(page.getByText(/Step 1 of 5/)).toBeVisible();
  await page.getByLabel('WhatsApp number').fill('7712 3499');
  expect(await violationsOf(page)).toEqual([]);
  await page.getByRole('button', { name: 'Save and next' }).click();

  await expect(page.getByText(/Step 2 of 5/)).toBeVisible();
  await expect(page.getByText(/1 of 5 steps done/)).toBeVisible();
  await page
    .getByLabel('About your work')
    .fill('I make fake shirts for tests.');
  await page
    .getByRole('button', { name: /I have been sewing for many years/ })
    .click();
  await expect(page.getByLabel('About your work')).toHaveValue(
    /fake shirts for tests\. I have been sewing/,
  );
  expect(await violationsOf(page)).toEqual([]);
  await page.getByRole('button', { name: 'Save and next' }).click();

  await expect(page.getByText(/Step 3 of 5/)).toBeVisible();
  await page.locator('input[name^="cat_"]').first().check();
  expect(await violationsOf(page)).toEqual([]);
  await page.getByRole('button', { name: 'Save and next' }).click();

  await expect(page.getByText(/Step 4 of 5/)).toBeVisible();
  await page.locator('input[name^="serves_"]').first().check();
  await page.locator('#shop_area').selectOption({ index: 1 });
  expect(await violationsOf(page)).toEqual([]);
  await page.getByRole('button', { name: 'Save and next' }).click();

  await expect(page.getByText(/Step 5 of 5/)).toBeVisible();
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
  await page.getByLabel(/These are photos of my own work/).check();
  await page.locator('#photo-file').setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
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
  await expect(page.getByText('You are ready!')).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);
  await page.getByRole('button', { name: /My page is ready/ }).click();
  await expect(page.getByText('Thank you. We have been told')).toBeVisible();
  await expect(
    page.getByText('Waiting for the team to look at your page.'),
  ).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);
  // a small phone: nothing scrolls sideways on the overview or a step
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of [
    '/portal',
    '/portal/profile?step=about',
    '/portal/photos',
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('main *')]
          .filter(
            (e) => e.getBoundingClientRect().right > window.innerWidth + 1,
          )
          .map((e) => `${e.tagName.toLowerCase()}.${e.className}`),
      ),
      path,
    ).toEqual([]);
    expect(await violationsOf(page), path).toEqual([]);
  }

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/portal\/login$/);
  await page
    .getByLabel('Email', { exact: true })
    .fill('e2e-portal@example.test');
  await page
    .getByLabel('Password', { exact: true })
    .fill('a-long-fake-e2e-passphrase');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/portal$/);
});
