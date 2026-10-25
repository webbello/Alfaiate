import { describe, expect, it } from 'vitest';
import { worker } from './worker';
import { ORIGIN } from './helpers';

const visit = (path: string, headers: Record<string, string>) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, { headers, redirect: 'manual' }),
  );
const first = {
  'sec-fetch-dest': 'document',
  'sec-fetch-site': 'none',
};

describe('default language follows the browser (first visit only)', () => {
  it('moves a Tetun browser from the English page to the Tetun page, uncached', async () => {
    const response = await visit('/shop', {
      ...first,
      'accept-language': 'tet,en;q=0.5',
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/tet/shop');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('vary')).toContain('Accept-Language');
  });

  it('serves the English page to English browsers, to links inside the site and to bots', async () => {
    expect(
      (await visit('/', { ...first, 'accept-language': 'en-US,en;q=0.9' }))
        .status,
    ).toBe(200);
    expect(
      (
        await visit('/', {
          ...first,
          'sec-fetch-site': 'same-origin',
          'accept-language': 'tet',
        })
      ).status,
    ).toBe(200);
    expect((await visit('/', { 'accept-language': 'tet' })).status).toBe(200);
  });

  it('shows the language switch in the phone bar and in the desktop menu row, not in the overlay', async () => {
    const html = await (await visit('/', {})).text();
    const bar = html.slice(html.indexOf('class="header-wrap-block"'));
    expect(bar.slice(0, bar.indexOf('data-nav-toggle'))).toContain(
      'class="lang-switch is-compact"',
    );
    expect(html.match(/class="lang-switch/g)).toHaveLength(2);
  });
});
