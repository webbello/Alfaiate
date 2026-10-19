import { expect, test } from '@playwright/test';

// SEC-08: the strict policy (no inline script or style) must not be violated by any public page, and no page may log a console error.
const PATHS = [
  '/',
  '/tailors',
  '/tailors?category=placeholder-category-1',
  '/categories/placeholder-category-1',
  '/tailors/e2e-fake-tailor',
  '/request',
  '/join',
  '/tet/join',
  '/request/thanks?ref=AT-ABCD2345',
  '/how-it-works',
  '/about',
  '/privacy',
  '/terms',
  '/no-such-page',
  '/tet/',
  '/tet/tailors',
  '/tet/tailors/e2e-fake-tailor',
  '/tet/request',
];

for (const path of PATHS) {
  test(`no CSP violation or console error on ${path}`, async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      // the 404 page itself answers 404, which the browser logs as a failed load: expected there
      const expected404 =
        path === '/no-such-page' && /status of 404/.test(message.text());
      if (message.type() === 'error' && !expected404)
        problems.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) =>
      problems.push(`page error: ${error.message}`),
    );
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { __csp: string[] }).__csp = [
          ...((window as unknown as { __csp?: string[] }).__csp ?? []),
          `${event.violatedDirective} ${event.blockedURI}`,
        ];
      });
    });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    // exercise the script on the profile page: a tap must not raise a violation either
    if (path.includes('/tailors/e2e-fake-tailor'))
      await page
        .locator('a[data-contact-channel="phone"]')
        .dispatchEvent('click');
    const violations = await page.evaluate(
      () => (window as unknown as { __csp?: string[] }).__csp ?? [],
    );
    expect([...problems, ...violations.map((v) => `csp: ${v}`)]).toEqual([]);
  });
}
