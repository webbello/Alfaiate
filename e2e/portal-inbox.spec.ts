import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';
import { violationsOf } from './axe';

// The tailor inbox end to end (FR-TPO-09..12): staff refer a request and send it to the inbox, make the tailor a sign-in, the tailor sees what is asked but not who asks,
// accepts, and then sees the customer. Phone width, axe on every page.
test('a request goes from the admin to the tailor inbox, and the customer is shown only after Accept', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto('/admin/enquiries?q=AT-E2EFAKE2');
  await page.locator('.req-card__ref', { hasText: 'AT-E2EFAKE2' }).click();
  await page
    .getByLabel('Approved tailor')
    .selectOption({ label: 'E2E Fake Tailor' });
  await page.getByRole('button', { name: 'Create referral' }).click();
  await expect(page.getByText('Referral created.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Send to the tailor’s inbox' })
    .click();
  await expect(page.getByText(/Sent to the tailor’s inbox/)).toBeVisible();
  await expect(
    page.getByText(/In the tailor’s portal inbox since/),
  ).toBeVisible();

  await page.goto('/admin/tailors');
  await page.getByRole('link', { name: 'E2E Fake Tailor' }).first().click();
  await page.getByRole('link', { name: 'More' }).click(); // the page shows one section at a time
  await page
    .getByRole('button', {
      name: /Create a sign-in link|Make a new sign-in link/,
    })
    .click();
  const link = await page.getByLabel('Link').inputValue();
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await page
    .getByLabel('Email', { exact: true })
    .fill('e2e-inbox-tailor@example.test');
  await page.getByLabel(/Choose a password/).fill('a-long-fake-e2e-passphrase');
  await page.getByLabel(/I agree that Alfaiate TL may show/).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(
    page.getByText('You have 1 request waiting for your answer.'),
  ).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);

  await page.getByRole('link', { name: 'See requests' }).click();
  await expect(page.getByText('AT-E2EFAKE2')).toBeVisible();
  await expect(page.getByText('Waiting for your answer')).toBeVisible();
  expect(await page.content()).not.toContain('E2E Fake Customer');
  expect(await violationsOf(page)).toEqual([]);

  await page.getByRole('link', { name: 'Open and answer' }).click();
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
  expect(await page.content()).not.toMatch(
    /E2E Fake Customer|77654321|Made-up notes/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await violationsOf(page)).toEqual([]);

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByText('You accepted.')).toBeVisible();
  await expect(
    page.getByText('E2E Fake Customer', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('+67077654321')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'WhatsApp the customer' }),
  ).toHaveAttribute('href', /^https:\/\/wa\.me\/67077654321\?text=/);
  expect(await violationsOf(page)).toEqual([]);
});
