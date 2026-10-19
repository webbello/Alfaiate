import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> }; // no @types/node in this project

// Referral journey as the throwaway owner created by e2e/run.mjs: pass an enquiry to a tailor, record what happened, then see it on the dashboard.
const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test('the owner records a referral, a reported completion and a fee, and sees it on the dashboard (AC-12, AC-13, AC-14)', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto('/admin/enquiries?q=AT-E2EFAKE3');
  await page.getByRole('link', { name: 'AT-E2EFAKE3' }).click();

  await page
    .getByLabel('Approved tailor')
    .selectOption({ label: 'E2E Fake Tailor' });
  await page.getByRole('button', { name: 'Create referral' }).click();
  await expect(page.getByText('Referral created.')).toBeVisible();

  await page.getByLabel('Forwarded on').fill('2026-06-09');
  await page.getByLabel('Forwarded by').selectOption('whatsapp');
  await page.getByLabel('Tailor response').selectOption('accepted');
  await page.getByLabel('Completion reported on').fill('2026-06-12');
  await page.getByLabel('Reported by').selectOption('tailor');
  await page.getByRole('button', { name: 'Save referral' }).click();
  await expect(page.getByText('Referral saved.')).toBeVisible();

  await page.getByLabel('Fee amount in US dollars').fill('12.5');
  await page.getByLabel('Fee status').selectOption('due');
  await page.getByRole('button', { name: 'Save fee' }).click();
  await expect(page.getByText('Fee saved.')).toBeVisible();

  // a second referral is refused while this one is accepted (one active referral at a time)
  await expect(
    page.getByRole('button', { name: 'Create referral' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create referral' }).click();
  await expect(
    page.getByText(/already has a referral that is pending or accepted/),
  ).toBeVisible();

  let { violations } = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);

  await page.goto('/admin?period=all');
  await expect(
    page
      .locator('dt', { hasText: 'Fees due (reported)' })
      .locator('xpath=following-sibling::dd[1]'),
  ).toContainText('$12.50');
  ({ violations } = await new AxeBuilder({ page }).withTags(tags).analyze());
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});
