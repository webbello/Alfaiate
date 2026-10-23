import { describe, expect, it } from 'vitest';
import { ORIGIN, get } from './helpers';
import { worker } from './worker';

// The theme fonts are self-hosted and swap in without blocking text.
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

describe('the theme fonts', () => {
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
