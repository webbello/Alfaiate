import { describe, expect, it } from 'vitest';
import { preferredLanguage, tetumRedirect } from '../../src/i18n/preference';

const both = ['en', 'tet'] as const;
const visit = (
  path: string,
  headers: Record<string, string> = {},
  method = 'GET',
) => {
  const url = new URL(`https://example.test${path}`);
  return tetumRedirect(
    new Request(url, {
      method,
      headers: {
        'sec-fetch-dest': 'document',
        'sec-fetch-site': 'none',
        'accept-language': 'tet',
        ...headers,
      },
    }),
    url,
    both,
  );
};

describe('preferredLanguage', () => {
  it('takes the first supported language by weight, then by order', () => {
    expect(preferredLanguage('tet')).toBe('tet');
    expect(preferredLanguage('pt-TL,tet;q=0.8,en;q=0.5')).toBe('tet');
    expect(preferredLanguage('en-US,en;q=0.9,tet;q=0.8')).toBe('en');
    expect(preferredLanguage('en;q=0.4,tdt;q=0.9')).toBe('tet');
    expect(preferredLanguage('tet;q=0,en')).toBe('en');
    expect(preferredLanguage('fr,de;q=0.5')).toBeNull();
    expect(preferredLanguage('')).toBeNull();
    expect(preferredLanguage(null)).toBeNull();
  });
});

describe('tetumRedirect', () => {
  it('sends a first visit that prefers Tetun to the Tetun twin, keeping the query', () => {
    expect(visit('/')).toBe('/tet/');
    expect(visit('/shop?x=1')).toBe('/tet/shop?x=1');
    expect(visit('/tailors/some-tailor/')).toBe('/tet/tailors/some-tailor');
    expect(visit('/about', { 'sec-fetch-site': 'cross-site' })).toBe(
      '/tet/about',
    );
  });

  it('leaves English preferences, links inside the site and non-pages alone', () => {
    expect(visit('/', { 'accept-language': 'en-US,en;q=0.9' })).toBeNull();
    expect(visit('/', { 'accept-language': '' })).toBeNull();
    expect(visit('/', { 'sec-fetch-site': 'same-origin' })).toBeNull();
    expect(visit('/', { 'sec-fetch-site': 'same-site' })).toBeNull();
    expect(visit('/', { 'sec-fetch-dest': 'image' })).toBeNull();
    expect(visit('/', {}, 'POST')).toBeNull();
    expect(visit('/tet/')).toBeNull();
    for (const path of [
      '/admin',
      '/portal/login',
      '/api/x',
      '/order',
      '/robots.txt',
      '/sitemap.xml',
      '/media/a.jpg',
      '/_astro/a.js',
    ])
      expect(visit(path), path).toBeNull();
  });

  it('does nothing when Tetun is not switched on', () => {
    const url = new URL('https://example.test/');
    const request = new Request(url, {
      headers: {
        'sec-fetch-dest': 'document',
        'sec-fetch-site': 'none',
        'accept-language': 'tet',
      },
    });
    expect(tetumRedirect(request, url, ['en'])).toBeNull();
  });
});
