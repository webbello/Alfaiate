import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/modules/tailors/slug';

describe('slugify', () => {
  it('lower-cases, drops accents and joins words with single dashes', () => {
    expect(slugify('Alfaiate São João')).toBe('alfaiate-sao-joao');
    expect(slugify('  Ana & Filhos!!  ')).toBe('ana-filhos');
    expect(slugify('Tais--Moderno__2024')).toBe('tais-moderno-2024');
  });

  it('falls back to "tailor" when nothing usable is left', () => {
    expect(slugify('')).toBe('tailor');
    expect(slugify('!!!')).toBe('tailor');
    expect(slugify('Δημήτρης')).toBe('tailor');
  });

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.startsWith('word-word')).toBe(true);
  });

  it('only ever returns characters that are safe in a URL path', () => {
    expect(slugify("<script>alert('x')</script> /../ %2e")).toMatch(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
    );
  });
});
