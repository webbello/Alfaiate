import { describe, expect, it } from 'vitest';
import { ORIGIN, get } from './helpers';
import { worker } from './worker';

// Phase 7c T1: the display serif is self-hosted, small, licensed and swaps in without blocking text.
const FONT = '/fonts/alfaiate-display.woff2';
const css = async () => {
  const html = await (await get('/about')).text();
  return (
    await Promise.all(
      [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(
        async (m) =>
          (await worker.fetch(new Request(`${ORIGIN}${m[1]}`))).text(),
      ),
    )
  ).join('\n');
};

describe('the display font', () => {
  it('is served from our own origin as a small WOFF2', async () => {
    const response = await get(FONT);
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('wOF2');
    expect(bytes.length).toBeLessThanOrEqual(30_000);
  });
  it('has its open licence next to it', async () => {
    const text = await (await get('/fonts/OFL-playfair-display.txt')).text();
    expect(text).toContain('SIL OPEN FONT LICENSE');
    expect(text).toContain('Playfair Display');
  });
  it("the theme's own fonts are declared with font-display swap and loaded from our origin only", async () => {
    const sheet = await css();
    expect(sheet).toMatch(/@font-face\s*{[^}]*Libre Baskerville[^}]*}/);
    expect(sheet).toMatch(/@font-face\s*{[^}]*Manrope[^}]*}/);
    expect(sheet).toMatch(/font-display:\s*swap/);
    expect(sheet).toContain('url(/fonts/theme/Manrope-latin.woff2)');
    expect(sheet).not.toMatch(/url\(["']?https?:\/\//);
    expect(sheet).not.toMatch(/fonts\.googleapis/);
  });
});
