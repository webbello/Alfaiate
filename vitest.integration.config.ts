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
          PUBLIC_LANGUAGES: 'en,tet',
          FORM_TOKEN_SECRET: 'integration-form-secret-0123456789',
          SITE_INDEXABLE: 'true',
          JOIN_ENABLED: 'true',
          SITE_WHATSAPP: '', // pinned: a developer's .dev.vars must not change what the tests see
          SITE_URL: 'https://alfaiate-tl.example',
        },
      },
    })),
  ],
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/workers/setup.ts'],
  },
});
