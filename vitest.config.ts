import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['vitest.container.config.ts', 'vitest.workers.config.ts'],
  },
});
