import { describe, expect, it } from 'vitest';
import { get } from './helpers';

// Handspark theme step 7: the theme's name and logo are gone; the pages say Alfaiate TL; the fonts are small WOFF2 files.
describe('brand', () => {
  it('shows the Alfaiate TL wordmark in the header and footer and never the theme name, on every public page type', async () => {
    for (const path of [
      '/',
      '/tailors',
      '/request',
      '/about',
      '/faq',
      '/tet/',
      '/no-such-page',
    ]) {
      const html = await (await get(path)).text();
      expect(html, path).toContain('class="brand-mark"');
      expect(html, path).toContain('brand-mark brand-mark--footer');
      expect(html, path).toMatch(/aria-label="Alfaiate TL"/);
      expect(html, path).not.toMatch(/handspark/i);
    }
  });
  it('serves every theme font as WOFF2 under 25 kB', async () => {
    const css = await (await get('/about')).text();
    const sheetHref = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/.exec(
      css,
    )![1];
    const sheet = await (await get(sheetHref)).text();
    const urls = [...sheet.matchAll(/url\((\/fonts\/theme\/[^)]+)\)/g)].map(
      (m) => m[1],
    );
    expect(urls.length).toBeGreaterThanOrEqual(9);
    for (const url of urls) {
      expect(url).toMatch(/\.woff2$/);
      const response = await get(url);
      expect(response.status, url).toBe(200);
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 4)), url).toBe('wOF2');
      expect(bytes.length, url).toBeLessThan(25_000);
    }
  });
});
