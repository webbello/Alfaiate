import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

// Runs the built Worker (dist/server) in workerd with local D1 and real HTTP requests. Run `npm run build` first.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './dist/server/wrangler.json' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
          // The built worker's own settings say English only; the integration suite tests both languages.
          PUBLIC_LANGUAGES: 'en',
          FORM_TOKEN_SECRET: 'integration-form-secret-0123456789',
          SITE_INDEXABLE: 'true',
          SITE_URL: 'https://alfaiate-tl.example',
          SITE_WHATSAPP: '+67077000000',
          JOIN_ENABLED: 'false',
          NEWSLETTER_ENABLED: 'false',
          SHOW_TESTIMONIAL_PLACEHOLDERS: 'false', // pinned: a developer's .dev.vars must not change what the tests see
        },
      },
    })),
  ],
  test: {
    testTimeout: 30_000, // generous: the suites are slow on a busy machine
    name: 'integration-en',
    include: ['tests/integration-en/**/*.test.ts'],
    setupFiles: ['tests/workers/setup.ts'],
  },
});
