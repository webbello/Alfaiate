import { describe, expect, it } from 'vitest';
import { get } from './helpers';

const page = async (path: string) => {
  const response = await get(path);
  return { response, html: await response.text() };
};

describe('public shell: 404 page in both languages', () => {
  it('answers an unknown English address with a real 404 page that is not indexed', async () => {
    const { response, html } = await page('/no-such-page');
    expect(response.status).toBe(404);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('We could not find that page');
    expect(html).toContain('name="robots" content="noindex,follow"');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('hreflang');
  });

  it('answers an unknown Tetum address in Tetum', async () => {
    const { response, html } = await page('/tet/no-such-page');
    expect(response.status).toBe(404);
    expect(html).toContain('<html lang="tet">');
    expect(html).toContain('Salta ba konteúdu prinsipál');
    expect(html).toContain('Fila ba pájina inísiu');
  });

  it('has a skip link first, a labelled navigation and a main landmark', async () => {
    const { html } = await page('/no-such-page');
    expect(html.indexOf('class="skip-link"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="skip-link"')).toBeLessThan(
      html.indexOf('<header'),
    );
    expect(html).toContain('<nav class="site-nav" aria-label="Main menu">');
    expect(html).toContain('<main id="main">');
    expect(html).toContain('href="#main"');
  });

  it('shows the disclaimer in the footer of every page', async () => {
    expect((await page('/no-such-page')).html).toContain(
      'introduces you to independent tailors',
    );
    expect((await page('/tet/no-such-page')).html).toContain(
      'aprezenta ita ba alfaiate independente',
    );
  });

  it('keeps the strict policy: no inline script or style, stylesheet is an external file that loads', async () => {
    const { response, html } = await page('/no-such-page');
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    );
    expect(html).not.toContain('<style');
    expect(html).not.toMatch(/<script(?![^>]*src=)/);
    expect(html).not.toMatch(/\sstyle="/);
    const href = html.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];
    expect(href).toBeTruthy();
    const css = await get(href!);
    expect(css.status).toBe(200);
    expect(await css.text()).toContain('.skip-link');
  });

  it('carries the usual security headers on the 404 page, and nothing that marks it admin', async () => {
    const { response } = await page('/no-such-page');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
