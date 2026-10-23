import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000, // generous: the suites are slow on a busy machine
    projects: [
      'vitest.workers.config.ts',
      'vitest.integration.config.ts',
      'vitest.integration-en.config.ts',
      'vitest.integration-staging.config.ts',
    ],
  },
});
