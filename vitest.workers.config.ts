import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

// Runs tests inside workerd with local D1/R2 from wrangler.jsonc; migrations are applied in setup.ts.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
      },
    })),
  ],
  test: {
    name: 'workers',
    include: ['tests/workers/**/*.test.ts'],
    setupFiles: ['tests/workers/setup.ts'],
  },
});
