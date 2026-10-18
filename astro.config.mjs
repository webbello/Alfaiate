/* global process */
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  // The adapter's Vite plugin starts workerd and clashes with Vitest; tests render components without it.
  adapter: process.env.VITEST ? undefined : cloudflare(),
});
