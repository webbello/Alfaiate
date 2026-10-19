import { expect, test } from '@playwright/test';
import { violationsOf } from './axe';

declare const process: { env: Record<string, string | undefined> }; // no @types/node in this project

// NFR-A11Y-01, AC-17: every admin page too, signed in as the throwaway owner (so the owner-only forms are on the page).
test('every admin page passes axe (WCAG 2.2 AA)', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL ?? '');
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const tailorHref = await page
    .goto('/admin/tailors')
    .then(() =>
      page
        .getByRole('link', { name: 'E2E Fake Tailor' })
        .first()
        .getAttribute('href'),
    );
  expect(tailorHref).toMatch(/^\/admin\/tailors\/\d+$/);
  await page.goto('/admin/enquiries?q=AT-E2EFAKE2');
  const enquiryHref = await page
    .getByRole('link', { name: 'AT-E2EFAKE2' })
    .getAttribute('href');

  const pages = [
    '/admin',
    '/admin?period=all',
    '/admin/account',
    '/admin/tailors',
    '/admin/tailors/new',
    tailorHref!,
    '/admin/categories',
    '/admin/areas',
    '/admin/enquiries',
    '/admin/enquiries?spam=1&status=new',
    enquiryHref!,
    '/admin/users',
  ];
  const problems: string[] = [];
  for (const path of pages) {
    await page.goto(path);
    for (const violation of await violationsOf(page))
      problems.push(`${path} -> ${violation}`);
  }
  expect(problems).toEqual([]);
});
