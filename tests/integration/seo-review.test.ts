import { describe, expect, it } from 'vitest';
import { get } from './helpers';

// Handspark theme step 7, SEO review: every public page has its own title and a description, one h1, and the language is declared.
const PAGES = [
  '/',
  '/tailors',
  '/request',
  '/join',
  '/contact',
  '/about',
  '/how-it-works',
  '/services',
  '/craft',
  '/business',
  '/faq',
  '/gallery',
  '/journal',
  '/privacy',
  '/terms',
];
describe('titles, descriptions and headings', () => {
  for (const prefix of ['', '/tet']) {
    it(`give each page its own title, a description and one h1 (${prefix || 'en'})`, async () => {
      const titles = new Map<string, string>();
      for (const path of PAGES) {
        const url = prefix ? (path === '/' ? '/tet/' : `/tet${path}`) : path;
        const html = await (await get(url)).text();
        const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
        expect(title, url).not.toBe('');
        expect(
          titles.get(title),
          `${url} repeats the title of ${titles.get(title)}`,
        ).toBeUndefined();
        titles.set(title, url);
        expect(html, url).toMatch(
          /<meta name="description" content="[^"]{20,}"/,
        );
        expect(html.match(/<h1\b/g), url).toHaveLength(1);
        expect(html, url).toContain(`<html lang="${prefix ? 'tet' : 'en'}">`);
      }
    });
  }
});
