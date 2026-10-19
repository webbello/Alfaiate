import { describe, expect, it } from 'vitest';
import { get } from '../integration/helpers';

// This project runs the built worker with PUBLIC_LANGUAGES=en: Tetum must be completely off.
describe('Tetum gate (English only)', () => {
  it('answers /tet/... with the English 404 page, never Tetum text', async () => {
    for (const path of ['/tet/no-such-page', '/tet/', '/tet']) {
      const response = await get(path);
      const html = await response.text();
      expect(response.status, path).toBe(404);
      expect(html, path).toContain('<html lang="en">');
      expect(html, path).toContain('We could not find that page');
      expect(html, path).not.toContain('Salta ba konteúdu');
    }
  });

  it('shows no language switch and no Tetum alternate', async () => {
    const html = await (await get('/no-such-page')).text();
    expect(html).not.toContain('hreflang="tet"');
    expect(html).not.toContain('lang="tet"');
  });
});

describe('Tetum gate on real pages (English only)', () => {
  it('answers 404 with the English page for Tetum addresses that exist when Tetum is on', async () => {
    for (const path of ['/tet/', '/tet/request']) {
      const response = await get(path);
      const html = await response.text();
      expect(response.status, path).toBe(404);
      expect(html, path).toContain('We could not find that page');
      expect(html, path).not.toContain('Buka alfaiate');
      expect(html, path).not.toContain('<html lang="tet">');
    }
  });

  it('serves the English home page and request page normally, with no link or alternate to Tetum', async () => {
    for (const path of ['/', '/request']) {
      const response = await get(path);
      const html = await response.text();
      expect(response.status, path).toBe(200);
      expect(html, path).not.toContain('/tet');
      expect(html, path).not.toContain('hreflang="tet"');
    }
  });
});
