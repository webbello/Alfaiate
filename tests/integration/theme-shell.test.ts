import { describe, expect, it } from 'vitest';
import { ORIGIN, get } from './helpers';
import { worker } from './worker';

// Handspark theme, step 2 (docs/SPEC-handspark-theme.md): the new page frame keeps our security rules, head and language switch.
const page = async (path: string) => {
  const res = await get(path);
  return { res, html: await res.text() };
};

describe('the Handspark page frame (ThemeLayout)', () => {
  it('serves the preview with the security headers and the theme frame', async () => {
    const { res, html } = await page('/theme-preview');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain(
      "style-src 'self'",
    );
    expect(html).toContain('class="header-section');
    expect(html).toContain('class="footer-section"');
    expect(html).toContain('data-cart');
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('Tailoring made to your measure');
  });

  it('writes no inline style or script, so the content security policy is never broken', async () => {
    const { html } = await page('/theme-preview');
    expect(html, '<style> tag').not.toMatch(/<style[\s>]/);
    expect(html, 'style attribute').not.toMatch(/\sstyle="/);
    expect(html, 'event attribute').not.toMatch(/\son[a-z]+="/);
    // scripts: only external files and data blocks
    expect(html).not.toMatch(
      /<script(?![^>]*(\bsrc=|type="application\/ld\+json"))[^>]*>/,
    );
    expect(html).toContain('<script src="/js-flag.js"');
  });

  it('loads one stylesheet and the theme script from this site, and no third-party address', async () => {
    const { html } = await page('/theme-preview');
    const css = [
      ...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(css.length).toBeGreaterThan(0);
    for (const href of css) {
      expect(href.startsWith('/')).toBe(true);
      expect((await worker.fetch(new Request(`${ORIGIN}${href}`))).status).toBe(
        200,
      );
    }
    const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(scripts.some((s) => s.includes('/_astro/'))).toBe(true);
    for (const s of scripts)
      expect((await worker.fetch(new Request(`${ORIGIN}${s}`))).status).toBe(
        200,
      );
    expect(html).not.toMatch(
      /<(?:script|link|img|source|iframe)[^>]*(?:src|href)="https?:\/\/(?!alfaiate-tl\.example)/,
    );
  });

  it('keeps our head: canonical, hreflang twins, noindex, and no social tags on a noindex page', async () => {
    const { html } = await page('/theme-preview');
    expect(html).toContain(
      '<link rel="canonical" href="https://alfaiate-tl.example/theme-preview"',
    );
    expect(html).toContain(
      'hreflang="tet" href="https://alfaiate-tl.example/tet/theme-preview"',
    );
    expect(html).toContain('hreflang="x-default"');
    expect(html).toMatch(/<meta name="robots" content="noindex/);
    expect(html).not.toContain('og:title');
    expect(html).toContain('<html lang="en"');
  });

  it('has the EN | TET switch in both directions and a Tetun page', async () => {
    const en = (await page('/theme-preview')).html;
    expect(en).toMatch(
      /<span aria-current="true" lang="en">\s*EN\s*<\/span><a href="\/tet\/theme-preview"[^>]*aria-label="Tetun">\s*TET\s*<\/a>/,
    );
    const tet = (await page('/tet/theme-preview')).html;
    expect(tet).toContain('<html lang="tet"');
    expect(tet).toMatch(
      /<span aria-current="true" lang="tet">\s*TET\s*<\/span><a href="\/theme-preview"[^>]*aria-label="English">\s*EN\s*<\/a>/,
    );
    expect(tet).toContain('Alfaiate ba Ita-nia Estilu');
  });

  it('is not listed in the sitemap', async () => {
    const { html } = await page('/sitemap.xml');
    expect(html).not.toContain('theme-preview');
  });
});
