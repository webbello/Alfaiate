import { describe, expect, it } from 'vitest';
import { get } from './helpers';

// Launch review 2026-10-24: a tailor who lost the invite email must be able to find the sign-in page from any public page.
describe('the tailor sign-in link', () => {
  it('is in the footer of the home page and of a Tetun page', async () => {
    for (const path of ['/', '/tailors', '/about']) {
      const html = await (await get(path)).text();
      const footer = /<footer[\s\S]*<\/footer>/.exec(html)![0];
      expect(footer, path).toMatch(
        /href="\/portal\/login"[^>]*>\s*Tailor sign in/,
      );
    }
  });
  it('and the join thank-you page explains how a tailor signs in later (when joining is switched on)', async () => {
    const html = await (await get('/join/thanks?ref=JN-ABCDEFGH')).text();
    if (html.includes('we have your details'))
      expect(html).toContain('Tailor sign in');
  });
});
