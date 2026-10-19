import { describe, expect, it } from 'vitest';
import { normalisePhone } from '../../src/modules/contact-links/phone';

// AD-10 (owner-approved draft, 2026-10-19): +670 then 8 digits; mobile starts with 7, landline with 3.
describe('normalisePhone: accepted forms', () => {
  const accepted: [string, string][] = [
    ['77123456', '+67077123456'],
    ['+67077123456', '+67077123456'],
    ['+670 7712 3456', '+67077123456'],
    ['(670) 7712-3456', '+67077123456'],
    ['670 77123456', '+67077123456'],
    ['00670 77123456', '+67077123456'],
    ['  +670.7712.3456  ', '+67077123456'],
    ['7712 3456', '+67077123456'],
    ['+670 3312 3456', '+67033123456'],
    ['33123456', '+67033123456'],
  ];
  for (const [input, expected] of accepted) {
    it(`turns "${input}" into ${expected}`, () => {
      expect(normalisePhone(input)).toBe(expected);
    });
  }

  it('is idempotent', () => {
    const once = normalisePhone('7712 3456');
    expect(normalisePhone(once as string)).toBe(once);
  });
});

describe('normalisePhone: rejected input', () => {
  const rejected = [
    '',
    '   ',
    'abc',
    '7712345', // 7 digits
    '771234567', // 9 digits
    '97123456', // first digit not 7 or 3
    '67123456', // looks like a prefix but is not one
    '+6707712345', // too short after +670
    '+670771234567', // too long after +670
    '+62 812 3456 7890', // other country
    '+7712 3456', // + without 670
    '++67077123456',
    '77123456+',
    '7712-3456 ext 5',
    '7712 3456x',
    '006707712345',
    '+670 9712 3456',
    '0677123456',
    '１２３４５６７８', // full-width digits
  ];
  for (const input of rejected) {
    it(`rejects "${input}"`, () => {
      expect(normalisePhone(input)).toBeNull();
    });
  }

  it('never returns something the database would reject', () => {
    for (const input of ['77123456', '+670 3312 3456', '00670 77123456']) {
      expect(normalisePhone(input)).toMatch(/^\+[1-9]\d{7,14}$/);
    }
  });
});
