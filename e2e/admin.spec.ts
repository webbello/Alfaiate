import { violationsOf } from './axe';
import { expect, test } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> }; // no @types/node in this project

// Admin pages: signed in as the throwaway owner created by e2e/run.mjs.
const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';

test('the inbox and an enquiry pass axe, and a status change shows in the history (AC-11)', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto('/admin/enquiries');
  await expect(page.getByRole('link', { name: 'AT-E2EFAKE2' })).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);

  await page.getByRole('link', { name: 'AT-E2EFAKE2' }).click();
  await expect(
    page.locator('dd', { hasText: 'E2E Fake Customer' }),
  ).toBeVisible();
  expect(await violationsOf(page)).toEqual([]);

  await page.getByLabel('Status').selectOption('contacted');
  await page.getByRole('button', { name: 'Set status' }).click();
  await expect(page.getByText('Status saved.')).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'New → Contacted' }),
  ).toBeVisible();
});
