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
          // Staging: both languages on, SITE_INDEXABLE off.
          PUBLIC_LANGUAGES: 'en,tet',
          FORM_TOKEN_SECRET: 'integration-form-secret-0123456789',
          SITE_INDEXABLE: 'false',
          JOIN_ENABLED: 'false',
          NEWSLETTER_ENABLED: 'false',
          SHOW_TESTIMONIAL_PLACEHOLDERS: 'true',
          SHOW_DRAFT_POSTS: 'true',
          RESPONSE_WINDOW_EN: 'within one working day',
          RESPONSE_WINDOW_TET: 'iha loron serbisu ida laran', // pinned: a developer's .dev.vars must not change what the tests see
          SITE_WHATSAPP: '',
          ORDER_WHATSAPP: '+67077000001',
          SITE_URL: 'https://alfaiate-tl.example',
        },
      },
    })),
  ],
  test: {
    testTimeout: 30_000, // generous: the suites are slow on a busy machine
    name: 'integration-staging',
    include: ['tests/integration-staging/**/*.test.ts'],
    setupFiles: ['tests/workers/setup.ts'],
  },
});
