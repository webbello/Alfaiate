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
    'Not ready to publish: 4 things are still missing',
  );
  await expect(card.locator('.check--missing')).toHaveCount(4);
  expect(await violationsOf(page)).toEqual([]);

  // A fix link must land the control below the sticky bar (desktop and phone) and hand it focus.
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(page.url());
    await card.getByRole('link', { name: 'Tick the consent box' }).click();
    const landing = await page.evaluate(() => {
      const target = document.getElementById('contact-consent');
      const bar = [...document.querySelectorAll('.admin-header, .admin-topbar')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.height < 200 && r.top <= 1)
        .reduce((bottom, r) => Math.max(bottom, r.bottom), 0);
      return {
        top: target ? Math.round(target.getBoundingClientRect().top) : -1,
        bar: Math.round(bar),
        focused: document.activeElement?.id ?? '',
      };
    });
    expect(
      landing.top,
      `${viewport.width}px above the bar`,
    ).toBeGreaterThanOrEqual(landing.bar);
    expect(landing.top, `${viewport.width}px on screen`).toBeGreaterThan(0);
    expect(landing.focused, `${viewport.width}px focus`).toBe(
      'contact-consent',
    );
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  // Fix each item with the controls the checklist points at.
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(card.locator('.check--missing')).toHaveCount(3);
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
  await expect(card).toContainText('A WhatsApp or phone number on the profile');
  await page.getByRole('link', { name: 'Details' }).click(); // the page shows one section at a time
  await page.locator('#whatsapp').fill('+67070000099');
  await page
    .locator('form:has(#whatsapp)')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.locator('#checklist')).toContainText('Ready to publish');

  await page.getByRole('link', { name: 'Publishing' }).click();
  await page.locator('.confirm > summary', { hasText: /^Publish$/ }).click(); // publishing asks first
  await page.getByRole('button', { name: 'Yes, publish' }).click();
  await expect(page.locator('#live')).toContainText('This tailor is live');
  await expect(page.locator('#checklist')).toHaveCount(0);
});
