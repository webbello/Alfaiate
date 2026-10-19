import { describe, expect, it } from 'vitest';
import { ORIGIN, get } from './helpers';
import { worker } from './worker';

// Phase 7c T3: a hero with a decorative 3D swatch. Decoration carries no content, motion is opt-in, and the story stylesheet loads only where it is used.
const sheets = async (path: string) => {
  const html = await (await get(path)).text();
  const hrefs = [
    ...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g),
  ].map((m) => m[1]);
  const css = await Promise.all(
    hrefs.map(async (h) =>
      (await worker.fetch(new Request(`${ORIGIN}${h}`))).text(),
    ),
  );
  return { html, css };
};

describe('home hero', () => {
  it('holds the heading and both calls to action in one section, with a single h1', async () => {
    const { html } = await sheets('/');
    const hero =
      /<section class="hero"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
    expect(hero).toContain('<h1>Find a tailor in Dili</h1>');
    expect(hero).toContain('href="/request"');
    expect(hero).toContain('href="/tailors"');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
  });
  it('has a purely decorative swatch: hidden from assistive technology, no text, links or images', async () => {
    const { html } = await sheets('/');
    const art =
      /<div class="swatch-scene" aria-hidden="true">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/.exec(
        html,
      );
    expect(art, 'swatch scene inside the hero').not.toBeNull();
    const inner = art![1];
    expect(
      inner
        .replace(/<svg[\s\S]*?<\/svg>/g, '')
        .replace(/<[^>]+>/g, '')
        .trim(),
    ).toBe('');
    expect(inner).not.toMatch(/<(a|img|button|input)\b/);
    expect(html).not.toMatch(/<[^>]+\sstyle=/);
  });
  it('loads the story stylesheet on the home page only, not on a plain page', async () => {
    const home = await sheets('/');
    const about = await sheets('/about');
    expect(home.css.length).toBe(about.css.length + 1);
  });
  it('animates only when the visitor has not asked for less motion', async () => {
    const story = (await sheets('/')).css.find((c) => c.includes('.swatch'))!;
    expect(story).toBeDefined();
    const marker = '@media (prefers-reduced-motion:no-preference)';
    const at = story.indexOf(marker);
    expect(at, 'a no-preference block exists').toBeGreaterThan(-1);
    expect(
      story.slice(0, at).replace(/@keyframes[^{]+{(?:[^{}]|{[^}]*})*}/g, ''),
    ).not.toMatch(/[;{\s]animation:/);
    expect(story.slice(at)).toMatch(/animation:/);
  });
});
