/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Renders Astro components in Node, without the Workers runtime.
export default getViteConfig({
  test: { name: 'container', include: ['tests/container/**/*.test.ts'] },
});
