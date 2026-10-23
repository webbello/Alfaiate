import { describe, expect, it } from 'vitest';
import { ORIGIN, get } from './helpers';
import { worker } from './worker';

// Admin redesign T1 (NFR-A11Y-01): every text/background pair of the admin palette has at least 4.5:1,
// read from the stylesheet that is actually shipped, so changing a token cannot silently break contrast.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const PAIRS: [fg: string, bg: string][] = [
  ['ink', 'paper'],
  ['ink', 'band'],
  ['muted', 'paper'],
  ['muted', 'band'],
  ['accent', 'paper'],
  ['accent-ink', 'accent'],
  ['accent-ink', 'accent-dark'],
  ['side-ink', 'side-bg'],
  ['side-group', 'side-bg'],
  ['side-ink', 'side-active'],
  ['link', 'side-bg'],
  ['link', 'accent-soft'],
];

describe('admin colour tokens meet WCAG AA', () => {
  it('every pair has at least 4.5:1, and white (the card colour) works with ink, muted and the accent', async () => {
    const html = await (await get('/admin/login')).text();
    const href = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/.exec(
      html,
    )?.[1];
    expect(href).toBeTruthy();
    const css = await (
      await worker.fetch(new Request(`${ORIGIN}${href}`))
    ).text();
    const token = (name: string): string => {
      const m = new RegExp(
        `--${name}:\\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b`,
      ).exec(css);
      expect(m, `token --${name}`).not.toBeNull();
      const h = m![1]; // the minifier writes #fff for #ffffff
      return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`;
    };
    for (const [fg, bg] of [
      ...PAIRS,
      ['ink', 'white'],
      ['muted', 'white'],
      ['accent', 'white'],
    ]) {
      const f = fg === 'white' ? '#ffffff' : token(fg);
      const b = bg === 'white' ? '#ffffff' : token(bg);
      expect(ratio(f, b), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
