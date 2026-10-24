import { describe, expect, it } from 'vitest';
import { ORIGIN, get } from './helpers';
import { worker } from './worker';

// The Handspark page frame (ThemeLayout) keeps our security rules, head and language switch. Checked on /about, a page in the frame.
const page = async (path: string) => {
  const res = await get(path);
  return { res, html: await res.text() };
};

describe('the Handspark page frame (ThemeLayout)', () => {
  it('serves a content page with the security headers and the theme frame', async () => {
    const { res, html } = await page('/about');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain(
      "style-src 'self'",
    );
    expect(html).toContain('class="header-section');
    expect(html).toContain('class="footer-section"');
    expect(html).toContain('data-cart');
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('About Alfaiate TL');
  });

  it('writes no inline style or script, so the content security policy is never broken', async () => {
    const { html } = await page('/about');
    expect(html, '<style> tag').not.toMatch(/<style[\s>]/);
    expect(html, 'style attribute').not.toMatch(/\sstyle="/);
    expect(html, 'event attribute').not.toMatch(/\son[a-z]+="/);
    // scripts: only external files and data blocks
    expect(html).not.toMatch(
      /<script(?![^>]*(\bsrc=|type="application\/ld\+json"))[^>]*>/,
    );
    // no blocking script in the head: the hide-until-animated rule uses the CSS scripting media feature
    expect(html).not.toContain('js-flag');
  });

  it('loads one stylesheet and the theme script from this site, and no third-party address', async () => {
    const { html } = await page('/about');
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
    const { html } = await page('/request');
    expect(html).toContain(
      '<link rel="canonical" href="https://alfaiate-tl.example/request"',
    );
    expect(html).toContain(
      'hreflang="tet" href="https://alfaiate-tl.example/tet/request"',
    );
    expect(html).toContain('hreflang="x-default"');
    expect(html).toMatch(/<meta name="robots" content="noindex/);
    expect(html).not.toContain('og:title');
    expect(html).toContain('<html lang="en"');
  });

  it('has the EN | TET switch in both directions and a Tetun page', async () => {
    const en = (await page('/about')).html;
    expect(en).toMatch(
      /<span aria-current="true" lang="en">\s*EN\s*<\/span><a href="\/tet\/about"[^>]*aria-label="TET \(Tetun\)">\s*TET\s*<\/a>/,
    );
    const tet = (await page('/tet/about')).html;
    expect(tet).toContain('<html lang="tet"');
    expect(tet).toMatch(
      /<span aria-current="true" lang="tet">\s*TET\s*<\/span><a href="\/about"[^>]*aria-label="EN \(English\)">\s*EN\s*<\/a>/,
    );
  });
});
