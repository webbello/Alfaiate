import { describe, expect, it } from 'vitest';
import { telLink } from '../../src/modules/contact-links/tel';
import {
  whatsappLink,
  whatsappMessage,
} from '../../src/modules/contact-links/whatsapp';
import { formatMoney, priceText } from '../../src/modules/directory/format';
import {
  parseDirectoryFilters,
  directoryQuery,
} from '../../src/modules/directory/filters';
import { dictionary } from '../../src/i18n/public';

describe('telLink (AC-04)', () => {
  it('is tel: plus the E.164 number', () => {
    expect(telLink('+67077123456')).toBe('tel:+67077123456');
  });
  it('refuses anything that is not an E.164 number, so nothing odd ends up in an href', () => {
    for (const bad of [
      '',
      '77123456',
      '+670 7712 3456',
      'javascript:alert(1)',
      '+67077123456;x',
      '+0123456789',
      '+6707712345678901234',
      "+670'><script>",
    ]) {
      expect(() => telLink(bad), bad).toThrow();
    }
  });
});

describe('whatsappLink (AC-04)', () => {
  it('is https://wa.me/<digits> with the text encoded', () => {
    expect(whatsappLink('+67077123456', 'Hello there')).toBe(
      'https://wa.me/67077123456?text=Hello%20there',
    );
  });
  it('encodes quotes, ampersands, hashes and non-ASCII so the text cannot add parameters', () => {
    const link = whatsappLink('+67077123456', `Ana & "Filhos" #1 São João?x=1`);
    expect(link.startsWith('https://wa.me/67077123456?text=')).toBe(true);
    expect(link.split('?')).toHaveLength(2);
    expect(link).not.toMatch(/[&"#\s]/);
    expect(decodeURIComponent(link.split('?text=')[1])).toBe(
      `Ana & "Filhos" #1 São João?x=1`,
    );
  });
  it('refuses a bad number', () => {
    expect(() => whatsappLink('7712', 'x')).toThrow();
  });
});

describe('whatsappMessage', () => {
  it('names the listing and nothing else, in the page language', () => {
    expect(whatsappMessage(dictionary('en'), 'Atelier Ana')).toContain(
      'Atelier Ana',
    );
    expect(whatsappMessage(dictionary('tet'), 'Atelier Ana')).toContain(
      'Atelier Ana',
    );
    expect(whatsappMessage(dictionary('en'), 'Atelier Ana')).not.toContain('{');
  });
  it('cleans the name: control characters removed, length capped', () => {
    const text = whatsappMessage(
      dictionary('en'),
      `Evil\n\r\tName${'x'.repeat(300)}`,
    );
    expect(text).not.toMatch(/[\n\r\t]/);
    expect(text.length).toBeLessThan(300);
  });
});

describe('money and price text', () => {
  it('shows whole dollars without cents and others with two digits', () => {
    expect(formatMoney(2000)).toBe('$20');
    expect(formatMoney(2050)).toBe('$20.50');
    expect(formatMoney(7)).toBe('$0.07');
    expect(formatMoney(123456)).toBe('$1,234.56');
  });
  it('describes a range, a single price, a minimum and a maximum, and nothing when there is no price', () => {
    const t = dictionary('en');
    expect(priceText(t, 2000, 3550)).toBe('$20 – $35.50');
    expect(priceText(t, 2000, 2000)).toBe('$20');
    expect(priceText(t, 2000, null)).toBe('From $20');
    expect(priceText(t, null, 3500)).toBe('Up to $35');
    expect(priceText(t, null, null)).toBeNull();
  });
  it('uses the Tetum words for Tetum pages', () => {
    expect(priceText(dictionary('tet'), 2000, null)).not.toBe('From $20');
  });
});

describe('parseDirectoryFilters', () => {
  const parse = (query: string) =>
    parseDirectoryFilters(new URLSearchParams(query));
  it('reads known filters', () => {
    expect(parse('category=suits&area=comoro&home_visit=1')).toEqual({
      category: 'suits',
      area: 'comoro',
      homeVisit: true,
    });
    expect(parse('')).toEqual({
      category: undefined,
      area: undefined,
      homeVisit: false,
    });
  });
  it('drops anything that is not a plain slug or the flag value 1', () => {
    expect(parse("category=a' OR 1=1 --&area=../x&home_visit=yes")).toEqual({
      category: undefined,
      area: undefined,
      homeVisit: false,
    });
    expect(parse('category=%3Cscript%3E&area=A B')).toEqual({
      category: undefined,
      area: undefined,
      homeVisit: false,
    });
    expect(parse(`category=${'a'.repeat(61)}`).category).toBeUndefined();
  });
  it('uses the first value when a filter is repeated, and ignores unknown parameters', () => {
    expect(parse('category=suits&category=dresses&evil=1').category).toBe(
      'suits',
    );
  });
  it('builds a stable query for links', () => {
    expect(
      directoryQuery({ category: 'suits', area: undefined, homeVisit: true }),
    ).toBe('?category=suits&home_visit=1');
    expect(
      directoryQuery({
        category: undefined,
        area: undefined,
        homeVisit: false,
      }),
    ).toBe('');
  });
});
