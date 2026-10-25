import { expect, test } from '@playwright/test';
import { signIn } from './admin-login';
import { violationsOf } from './axe';

// FR-ADM-15: below the sidebar width a bottom bar (Enquiries, Orders, Tailors, More); it never covers the end of a page or a focused control.
for (const [width, height] of [
  [375, 812],
  [320, 640],
] as const) {
  test(`the phone bottom bar works and covers nothing (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await signIn(page);
    const bar = page.getByRole('navigation', { name: 'Shortcuts' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link')).toHaveText([
      'Enquiries',
      'Orders',
      'Tailors',
    ]);
    for (const link of await bar.getByRole('link').all())
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const barTop = (await bar.boundingBox())!.y;
    expect(
      (await bar.boundingBox())!.y + (await bar.boundingBox())!.height,
    ).toBeGreaterThanOrEqual(height - 1);

    await bar.getByRole('link', { name: 'Tailors' }).click();
    await expect(page).toHaveURL(/\/admin\/tailors$/);
    await expect(bar.getByRole('link', { name: 'Tailors' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // the last thing on a long page can be scrolled clear of the bar
    await page.goto('/admin/enquiries');
    expect(await violationsOf(page)).toEqual([]);
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    const clear = await page.evaluate((top) => {
      const last = document.querySelector('.admin-main')!.lastElementChild!;
      return last.getBoundingClientRect().bottom <= top;
    }, barTop);
    expect(clear, 'page end sits above the bar').toBe(true);

    // More opens the whole menu
    await page.evaluate(() => scrollTo(0, 0));
    await bar.getByText('More', { exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Garment types' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await violationsOf(page)).toEqual([]);
  });
}

test('the bottom bar is not shown beside the sidebar (1280px)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);
  await expect(
    page.getByRole('navigation', { name: 'Shortcuts' }),
  ).toBeHidden();
});
