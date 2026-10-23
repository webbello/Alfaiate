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
      '/about': '784ad8192b0e', // 2026-10-23: only the button label changed, "Request a tailor at home" to "Request a Tailor"
      '/how-it-works': 'f38da827d8b3', // same button label
      '/no-such-page': '8f5778279c8a',
      '/privacy': '4696861fd35c',
      '/terms': '999b18f1a5eb',
      '/tet/about': '49eda49fa345', // same button label (Husu Alfaiate)
      '/tet/how-it-works': 'eee37ebe6055', // same button label
      '/tet/no-such-page': '3f2ef287e8f4',
      '/tet/privacy': 'b627894fff79',
      '/tet/terms': 'd7eb59fdd750',
    });
  });
});
