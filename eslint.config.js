import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default [
  {
    ignores: [
      'worker-configuration.d.ts',
      'dist/',
      '.astro/',
      '.wrangler/',
      'node_modules/',
      // the Handspark theme's own scripts and templates (vendor code, linted by its own rules); our edits there are covered by the tests
      'src/theme/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        // used inside page.evaluate callbacks, which run in the browser (scripts/perf.mjs)
        window: 'readonly',
        performance: 'readonly',
        PerformanceObserver: 'readonly',
      },
    },
  },
];
