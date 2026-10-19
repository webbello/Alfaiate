import { describe, expect, it } from 'vitest';
import { swatchVariant } from '../../src/components/story/variant';

// Phase 7c T5: the illustrated stand-in for a missing photo is stable per tailor and always one of the known looks.
describe('swatchVariant', () => {
  it('is the same for the same slug and always 0, 1 or 2', () => {
    for (const slug of ['a', 'atelier-one', 'demo-ready-tailor', '', 'ñandú']) {
      expect(swatchVariant(slug)).toBe(swatchVariant(slug));
      expect([0, 1, 2]).toContain(swatchVariant(slug));
    }
  });
  it('uses all three looks across a handful of slugs', () => {
    const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(swatchVariant));
    expect(seen.size).toBe(3);
  });
});
