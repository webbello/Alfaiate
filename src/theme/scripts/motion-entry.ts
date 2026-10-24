/** The motion layer (GSAP, ScrollTrigger, Lenis): loaded only by pages that have animated elements. Importing this file starts it, once. */
import { initMotion } from './motion';
import { initSmoothScroll } from './smooth-scroll';

function start(): void {
  initMotion();
  void initSmoothScroll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
