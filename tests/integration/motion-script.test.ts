import { describe, expect, it } from 'vitest';
import { get } from './helpers';

// NFR-PERF-01: the motion layer (GSAP, about 130 kB) loads only where it is needed, but a page with animated elements
// must never lack it: the `data-anim` elements stay hidden until it has run.
const MOTION = /<script[^>]*src="[^"]*MotionScript[^"]*"/;
const PAGES = [
  '/', '/tailors', '/faq', '/journal', '/shop', '/gallery', '/about', '/request', '/order', '/how-it-works',
  '/join', '/craft', '/services', '/business', '/privacy', '/terms', '/tet/', '/tet/tailors', '/tet/faq',
];

describe('the motion script is loaded exactly where animated elements are', () => {
  for (const path of PAGES) {
    it(`${path}: data-anim ⇔ motion script`, async () => {
      const res = await get(path);
      if (res.status !== 200) return; // a page that is switched off has nothing to animate
      const html = await res.text();
      expect(MOTION.test(html), path).toBe(html.includes('data-anim'));
    });
  }

  it('the home page has it and the request form does not', async () => {
    expect(MOTION.test(await (await get('/')).text())).toBe(true);
    expect(MOTION.test(await (await get('/request')).text())).toBe(false);
  });
});
