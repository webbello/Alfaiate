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
