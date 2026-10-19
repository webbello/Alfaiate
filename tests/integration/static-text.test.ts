import { describe, expect, it } from 'vitest';
import { get } from './helpers';

// Phase 7c T8: restyling the static pages must not change one word of the owner's text (privacy, terms, about, how it works) or the 404 text.
// If this fails you changed wording: that needs the owner's approval (OQ-08), then update the fingerprints.
const sha = async (text: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);
const mainText = (html: string) =>
  /<main[\s\S]*<\/main>/
    .exec(html)![0]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const PATHS = [
  '/about',
  '/how-it-works',
  '/privacy',
  '/terms',
  '/no-such-page',
  '/tet/about',
  '/tet/how-it-works',
  '/tet/privacy',
  '/tet/terms',
  '/tet/no-such-page',
];

describe('static page text is unchanged', () => {
  it('has the recorded fingerprint for every page and language', async () => {
    const actual: Record<string, string> = {};
    for (const path of PATHS)
      actual[path] = await sha(mainText(await (await get(path)).text()));
    expect(actual).toEqual({
      '/about': '4d44c690b7c8',
      '/how-it-works': 'e18decde56ac',
      '/no-such-page': '8f5778279c8a',
      '/privacy': '4696861fd35c',
      '/terms': '999b18f1a5eb',
      '/tet/about': '4619138f7a92',
      '/tet/how-it-works': 'a02b235e831f',
      '/tet/no-such-page': '3f2ef287e8f4',
      '/tet/privacy': 'b627894fff79',
      '/tet/terms': 'd7eb59fdd750',
    });
  });
});
