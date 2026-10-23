import { expect, test } from '@playwright/test';

test('the FAQ accordion opens one answer at a time', async ({ page }) => {
  await page.goto('/faq');
  const first = page.getByRole('button', {
    name: 'How do I get a garment made to measure?',
  });
  const second = page.getByRole('button', { name: 'Who sets the price?' });
  await first.click();
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await second.click();
  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
});
