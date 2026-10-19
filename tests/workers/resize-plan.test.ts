import { describe, expect, it } from 'vitest';
import {
  MAX_ORIGINAL_BYTES,
  checkOriginal,
  planVariants,
} from '../../src/scripts/resize-plan';
import { LIMITS } from '../../src/modules/media/validate';

describe('planVariants', () => {
  it('scales a wide photo down to each variant width, keeping the aspect ratio', () => {
    const plan = planVariants(4000, 3000);
    expect(plan.thumb).toEqual({ width: 320, height: 240 });
    expect(plan.medium).toEqual({ width: 800, height: 600 });
    expect(plan.large).toEqual({ width: 1600, height: 1200 });
  });

  it('never enlarges a small photo', () => {
    const plan = planVariants(500, 400);
    expect(plan.thumb).toEqual({ width: 320, height: 256 });
    expect(plan.medium).toEqual({ width: 500, height: 400 });
    expect(plan.large).toEqual({ width: 500, height: 400 });
  });

  it('keeps very tall photos within the height the server accepts', () => {
    const plan = planVariants(1000, 9000);
    for (const variant of ['thumb', 'medium', 'large'] as const) {
      expect(plan[variant].height).toBeLessThanOrEqual(4000);
      expect(plan[variant].width).toBeLessThanOrEqual(LIMITS[variant].maxWidth);
      expect(plan[variant].width).toBeGreaterThanOrEqual(1);
    }
  });

  it('always stays inside the server limits, for odd shapes too', () => {
    for (const [w, h] of [
      [1, 1],
      [10000, 10],
      [10, 10000],
      [1600, 1600],
      [321, 4001],
      [8000, 8000],
    ]) {
      const plan = planVariants(w, h);
      for (const variant of ['thumb', 'medium', 'large'] as const) {
        expect(
          plan[variant].width,
          `${w}x${h} ${variant}`,
        ).toBeGreaterThanOrEqual(1);
        expect(
          plan[variant].height,
          `${w}x${h} ${variant}`,
        ).toBeGreaterThanOrEqual(1);
        expect(plan[variant].width).toBeLessThanOrEqual(
          LIMITS[variant].maxWidth,
        );
        expect(plan[variant].height).toBeLessThanOrEqual(4000);
      }
    }
  });

  it('rejects a photo with no size', () => {
    expect(() => planVariants(0, 100)).toThrow();
    expect(() => planVariants(100, 0)).toThrow();
  });
});

describe('checkOriginal (AD-07: 8 MB, JPEG/PNG/WebP)', () => {
  it('accepts the allowed types up to 8 MB', () => {
    expect(MAX_ORIGINAL_BYTES).toBe(8 * 1024 * 1024);
    for (const type of ['image/jpeg', 'image/png', 'image/webp'])
      expect(checkOriginal({ type, size: MAX_ORIGINAL_BYTES })).toBeNull();
  });
  it('names the problem for a wrong type, an empty file and an oversized file', () => {
    expect(checkOriginal({ type: 'image/gif', size: 1000 })).toBe('type');
    expect(checkOriginal({ type: 'application/pdf', size: 1000 })).toBe('type');
    expect(checkOriginal({ type: 'image/jpeg', size: 0 })).toBe('empty');
    expect(
      checkOriginal({ type: 'image/jpeg', size: MAX_ORIGINAL_BYTES + 1 }),
    ).toBe('size');
  });
});
