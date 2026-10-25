import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';

// FR-ADM-10: on a phone the four dashboard counters are all visible without scrolling, are links, and nothing scrolls sideways.
test('the dashboard counters fit one phone screen and link to their lists', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto('/admin');
  const counters = page.locator('.counters .counter');
  await expect(counters).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const box = (await counters.nth(i).boundingBox())!;
    expect(
      box.y + box.height,
      `counter ${i} above the fold`,
    ).toBeLessThanOrEqual(812);
    expect(box.height, `counter ${i} touch size`).toBeGreaterThanOrEqual(44);
  }
  const hrefs = await counters.evaluateAll((els) =>
    els.map((e) => e.getAttribute('href')),
  );
  expect(hrefs).toEqual([
    '/admin/enquiries?status=new',
    '/admin/interest',
    '/admin/tailors?published=0',
    '/admin/orders',
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await counters.nth(0).click();
  await expect(page).toHaveURL(/\/admin\/enquiries\?status=new/);
});
