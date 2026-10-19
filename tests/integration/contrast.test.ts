import { describe, expect, it } from 'vitest';
import { ORIGIN, get } from './helpers';
import { worker } from './worker';

// Phase 7c T1 (NFR-A11Y-01): every text/background pair the art direction uses is checked against WCAG AA (4.5:1 for text),
// from the colour tokens in the stylesheet that is actually shipped, so changing a token cannot silently break contrast.
const luminance = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((x) =>
    x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const PAIRS: [fg: string, bg: string][] = [
  ['ink', 'paper'],
  ['muted', 'paper'],
  ['muted', 'band'],
  ['accent', 'paper'],
  ['accent', 'band'],
  ['accent-ink', 'accent'],
  ['ink', 'chalk'],
  ['muted', 'chalk'],
  ['accent', 'chalk'],
  ['paper', 'indigo'],
  ['thread-light', 'indigo'],
  ['paper', 'deep'],
  ['thread-light', 'deep'],
  ['thread', 'paper'],
  ['thread', 'band'],
];

describe('colour tokens meet WCAG AA', () => {
  it('every text and background pair in the art direction has at least 4.5:1', async () => {
    const html = await (await get('/')).text();
    const href = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/.exec(html)![1];
    const css = await (
      await worker.fetch(new Request(`${ORIGIN}${href}`))
    ).text();
    const token = (name: string) => {
      const m = new RegExp(`--${name}:\\s*#([0-9a-fA-F]{3,6})\\b`).exec(css);
      expect(m, `--${name} is defined as a hex colour`).not.toBeNull();
      const h = m![1];
      return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`;
    };
    for (const [fg, bg] of PAIRS)
      expect(
        ratio(token(fg), token(bg)),
        `${fg} on ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
  });
});
