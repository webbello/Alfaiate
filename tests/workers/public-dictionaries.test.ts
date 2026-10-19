import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/public/en';
import { tet } from '../../src/i18n/public/tet';
import { dictionary, fill } from '../../src/i18n/public';

type Tree = { [key: string]: string | Tree };
const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [[prefix + key, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('public dictionaries', () => {
  const english = flatten(en as unknown as Tree);
  const tetum = flatten(tet as unknown as Tree);

  it('have exactly the same keys in both languages', () => {
    expect(Object.keys(tetum).sort()).toEqual(Object.keys(english).sort());
  });

  it('have no empty text', () => {
    for (const [key, value] of [
      ...Object.entries(english),
      ...Object.entries(tetum),
    ])
      expect(value.trim().length, key).toBeGreaterThan(0);
  });

  it('use the same {placeholders} in both languages', () => {
    for (const key of Object.keys(english))
      expect(placeholders(tetum[key]), key).toEqual(placeholders(english[key]));
  });

  it('are not English copied into the Tetum file (except names that are the same in both)', () => {
    const sameOnPurpose = new Set([
      'siteName',
      'language.en',
      'language.tet',
      'contact.whatsapp',
      'request.channelWhatsapp',
      'category.heading', // just the category name in both languages
    ]);
    for (const key of Object.keys(english)) {
      if (!sameOnPurpose.has(key))
        expect(tetum[key], key).not.toBe(english[key]);
    }
  });

  it('contain no raw HTML', () => {
    for (const [key, value] of Object.entries({ ...english, ...tetum }))
      expect(value, key).not.toMatch(/[<>]/);
  });
});

describe('dictionary and fill', () => {
  it('picks the dictionary for a language', () => {
    expect(dictionary('en')).toBe(en);
    expect(dictionary('tet')).toBe(tet);
  });
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(fill('Hello {name}, {missing}', { name: 'Ana' })).toBe(
      'Hello Ana, {missing}',
    );
  });
});
