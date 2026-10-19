import { describe, expect, it } from 'vitest';
import {
  imagePrefix,
  newImageKey,
  parseVariantKey,
  variantKey,
} from '../../src/modules/media/keys';

describe('image keys', () => {
  it('makes a long random hex key each time', () => {
    const a = newImageKey();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newImageKey()).not.toBe(a);
  });

  it('builds and parses a variant key', () => {
    const key = variantKey(7, 'a'.repeat(32), 'medium');
    expect(key).toBe(`tailor/7/${'a'.repeat(32)}/medium.jpg`);
    expect(parseVariantKey(key)).toEqual({
      tailorId: 7,
      imageKey: 'a'.repeat(32),
      variant: 'medium',
    });
    expect(key.startsWith(imagePrefix(7))).toBe(true);
  });

  it('does not let the prefix for tailor 1 match tailor 10', () => {
    expect(
      variantKey(10, 'b'.repeat(32), 'thumb').startsWith(imagePrefix(1)),
    ).toBe(false);
  });

  it('rejects anything that is not exactly the key shape: traversal, encoding, case, extras', () => {
    const good = 'c'.repeat(32);
    const bad = [
      '',
      '../etc/passwd',
      `tailor/7/${good}/medium.jpg/..`,
      `tailor/7/../${good}/medium.jpg`,
      `tailor/../${good}/medium.jpg`,
      `tailor/7/${good}/medium.png`,
      `tailor/7/${good}/huge.jpg`,
      `tailor/7/${'C'.repeat(32)}/medium.jpg`,
      `tailor/7/${'c'.repeat(31)}/medium.jpg`,
      `tailor/7/${good}/medium.jpg\n`,
      `tailor/07x/${good}/medium.jpg`,
      `/tailor/7/${good}/medium.jpg`,
      `tailor/7//medium.jpg`,
      `tailor/7/${good}/%2e%2e/medium.jpg`,
      `private/7/${good}/medium.jpg`,
    ];
    for (const key of bad)
      expect(parseVariantKey(key), JSON.stringify(key)).toBeNull();
  });
});
