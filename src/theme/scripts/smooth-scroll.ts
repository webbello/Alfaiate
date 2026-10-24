/**
 * Momentum scrolling, kept in step with the scroll-driven animations.
 *
 * Only runs on pointer devices at desktop widths — on touch, the platform's own
 * scrolling is better than anything we can synthesise. Lenis is fetched only then.
 */
import { gsap, ScrollTrigger } from './motion';

export async function initSmoothScroll(): Promise<void> {
  const coarse = matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (coarse || reduced) return;

  const { default: Lenis } = await import('lenis');
  const lenis = new Lenis({
    duration: 0.8,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    smoothWheel: true,
    allowNestedScroll: true,
  });

  // Drive Lenis from GSAP's ticker so both share one animation frame.
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
