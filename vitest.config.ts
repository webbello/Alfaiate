import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'vitest.workers.config.ts',
      'vitest.integration.config.ts',
      'vitest.integration-en.config.ts',
    ],
  },
});
