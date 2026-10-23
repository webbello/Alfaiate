import { describe, expect, it } from 'vitest';
import { get } from './helpers';

// Phase 7c T2: a quick-action bar for phones. It never covers the request form, has one nav landmark with a label, and shows no WhatsApp link until the owner sets a number.
const bar = (html: string) =>
  /<nav class="sticky-bar"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';

describe('the quick-action bar', () => {
  it('offers "Request a Tailor" (the same words as the header and the hero) on content pages in both languages, with a labelled landmark', async () => {
    for (const [path, label] of [
      ['/about', 'Request a Tailor'], // content pages still on the old frame; the home page uses the theme frame (step 3)
      ['/tailors', 'Request a Tailor'],
      ['/tet/about', 'Husu Alfaiate'],
    ] as const) {
      const b = bar(await (await get(path)).text());
      expect(b, path).toContain('aria-label=');
      expect(b, path).toContain(label);
      expect(b, path).toMatch(/href="(\/tet)?\/request"/);
    }
  });
  it('is absent on the request pages (it could cover the form) and the legal pages', async () => {
    for (const path of [
      '/request',
      '/tet/request',
      '/request/thanks?ref=AT-ABCD2345',
      '/privacy',
      '/terms',
    ])
      expect(bar(await (await get(path)).text()), path).toBe('');
  });
  it('has no WhatsApp link while the owner number is not set', async () => {
    expect(bar(await (await get('/about')).text())).not.toContain('wa.me');
  });
  it('is not inside the header or the main landmark, so the page order is unchanged', async () => {
    const html = await (await get('/about')).text();
    expect(html.indexOf('class="sticky-bar"')).toBeGreaterThan(
      html.indexOf('</main>'),
    );
  });
});
