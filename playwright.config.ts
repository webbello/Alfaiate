import { defineConfig } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> }; // no @types/node in this project
// Started by e2e/run.mjs, which provides the Worker and E2E_BASE_URL.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    viewport: { width: 375, height: 812 },
  },
});
