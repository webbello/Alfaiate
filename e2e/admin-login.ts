import { expect, type Page } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> }; // no @types/node in this project

/** Signs in as the throwaway owner created by e2e/run.mjs. */
export async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL ?? '');
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
