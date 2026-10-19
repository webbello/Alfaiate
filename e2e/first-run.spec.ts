import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';
import { violationsOf } from './axe';

// Phase 7b: a new person follows the on-screen checklist from a new draft to a published tailor, as the throwaway owner.
test('the checklist leads from a new draft to a published tailor', async ({
  page,
}) => {
  await signIn(page);

  await page.goto('/admin/categories');
  await page.locator('#new-name').fill('First Run Fake Category');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.goto('/admin/areas');
  await page.locator('#new-name').fill('First Run Fake Area');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await page.goto('/admin/tailors/new');
  await page.getByLabel('Shop or tailor name').fill('First Run Fake Tailor');
  await page.getByRole('button', { name: 'Create draft' }).click();

  const card = page.locator('#checklist');
  await expect(card).toContainText(
    'Not ready to publish: 3 things are still missing',
  );
  await expect(card.locator('.check--missing')).toHaveCount(3);
  expect(await violationsOf(page)).toEqual([]);

  // Fix each item with the controls the checklist points at.
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(card.locator('.check--missing')).toHaveCount(2);
  await page
    .getByLabel('How and when permission was given')
    .fill('Asked in person, made-up test note');
  await page.getByLabel('Date permission was given').fill('2026-06-01');
  await page
    .getByLabel(
      'The tailor agreed that their phone and WhatsApp numbers may be shown publicly',
    )
    .check();
  await page.getByRole('button', { name: 'Record permission' }).click();
  await expect(card.locator('.check--missing')).toHaveCount(1);
  await page.locator('#whatsapp').fill('+67070000099');
  await page
    .locator('form:has(#whatsapp)')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.locator('#checklist')).toContainText('Ready to publish');

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.locator('#live')).toContainText('This tailor is live');
  await expect(page.locator('#checklist')).toHaveCount(0);
});
