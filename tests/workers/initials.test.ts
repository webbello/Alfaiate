import { describe, expect, it } from 'vitest';
import { initials } from '../../src/components/story/variant';

describe('initials (the badge on a card with no photo)', () => {
  it('takes the first letter of the first two words, in capitals', () => {
    expect(initials('Atelier Lorosae')).toBe('AL');
    expect(initials('tais moderna studio')).toBe('TM');
    expect(initials('Baucau Stitch & Style')).toBe('BS');
  });
  it('copes with one word, accents, digits, symbols and nothing at all', () => {
    expect(initials('Fatumeta')).toBe('F');
    expect(initials('Liquiçá Alterasaun')).toBe('LA');
    expect(initials('24 Hour Tailor')).toBe('2H');
    expect(initials('&&& ---')).toBe('');
    expect(initials('')).toBe('');
  });
});
