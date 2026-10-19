import { describe, expect, it } from 'vitest';

// Phase 3 adds no public pages except the image route. Phase 4 updates this list on purpose.
const files = Object.keys(import.meta.glob('../../src/pages/**/*.{astro,ts}'))
  .map((p) => p.split('/src/pages/')[1])
  .filter((p) => !p.startsWith('admin/'))
  .sort();

describe('public routes (scope guard)', () => {
  it('are only the home page and the image route', () => {
    expect(files).toEqual(['index.astro', 'media/[...key].ts']);
  });
});
