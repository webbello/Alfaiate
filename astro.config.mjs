/* global process */
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  // The adapter's Vite plugin starts workerd and clashes with Vitest; tests render components without it.
  // Sessions live in D1 (ARCHITECTURE §6) and images in R2 (AD-04): no KV SESSION or IMAGES binding.
  session: false,
  adapter: process.env.VITEST
    ? undefined
    : cloudflare({ imageService: 'passthrough' }),
});
