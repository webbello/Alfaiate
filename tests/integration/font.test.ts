import { describe, expect, it } from 'vitest';
import { ORIGIN, get } from './helpers';
import { worker } from './worker';

// Phase 7c T1: the display serif is self-hosted, small, licensed and swaps in without blocking text.
const FONT = '/fonts/instrument-serif-regular.woff2';
const css = async () => {
  const html = await (await get('/')).text();
  const href = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/.exec(html)![1];
  return (await worker.fetch(new Request(`${ORIGIN}${href}`))).text();
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
    const text = await (await get('/fonts/OFL.txt')).text();
    expect(text).toContain('SIL OPEN FONT LICENSE');
    expect(text).toContain('Instrument Serif');
  });
  it('is declared with font-display swap, loaded from our origin only, and used by the display token', async () => {
    const sheet = await css();
    expect(sheet).toMatch(/@font-face\s*{[^}]*Instrument Serif[^}]*}/);
    expect(sheet).toContain(`url(${FONT})`);
    expect(sheet).toMatch(/font-display:\s*swap/);
    expect(sheet).not.toMatch(/https?:\/\//);
    expect(sheet).toMatch(/--display:\s*["']?Instrument Serif/);
  });
});
