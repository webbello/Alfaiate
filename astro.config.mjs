import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Sessions live in D1 (ARCHITECTURE §6) and images in R2 (AD-04): no KV SESSION or IMAGES binding.
  // Refuses cross-origin form posts; sign-in (the one POST without a CSRF token) relies on it. Explicit so a default change cannot drop it.
  security: { checkOrigin: true },
  session: false,
  // The CSP has no 'unsafe-inline' (SEC-08): no inline styles, no dev toolbar scripts.
  build: { inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
  // Never inline scripts into pages: the CSP has no 'unsafe-inline' (SEC-08).
  // Tailwind belongs to the Handspark theme pages only: the sheet is imported by ThemeLayout, so no other page loads it.
  vite: { build: { assetsInlineLimit: 0 }, plugins: [tailwindcss()] },
  // Pictures on prerendered theme pages are resized at build time; pages rendered on request keep the originals (a Worker cannot run sharp).
  adapter: cloudflare({ imageService: 'compile' }),
  image: { responsiveStyles: true, layout: 'constrained' },
  // The theme's fonts are plain @font-face rules in src/theme/styles/fonts.css, files under public/fonts/theme: the Astro fonts component writes an inline <style>, which our content security policy forbids.
});
