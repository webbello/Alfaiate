import { describe, expect, it } from 'vitest';
import { metaText } from '../../src/modules/seo/meta';

describe('metaText', () => {
  it('keeps plain text and collapses whitespace', () => {
    expect(metaText('We make   suits\nand dresses.', 160)).toBe(
      'We make suits and dresses.',
    );
  });
  it('removes markup characters so snippets and naive tools never see tags', () => {
    expect(
      metaText('<script>alert(1)</script> Hello "quoted" & more', 160),
    ).toBe('scriptalert(1)/script Hello "quoted" & more');
    expect(metaText('a<b>c', 160)).not.toMatch(/[<>]/);
  });
  it('cuts at a word boundary when too long, adding an ellipsis', () => {
    const text = metaText('word '.repeat(60), 40);
    expect(text.length).toBeLessThanOrEqual(41);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toMatch(/wor…$/);
  });
  it('returns an empty string for empty input', () => {
    expect(metaText('   ', 160)).toBe('');
  });
});
