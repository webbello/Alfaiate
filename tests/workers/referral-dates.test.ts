import { describe, expect, it } from 'vitest';
import {
  addDays,
  diliDay,
  diliDayStartUtc,
  isDiliDate,
} from '../../src/modules/referral/dates';

// Dates the admin types are Dili calendar days (UTC+9, no daylight saving).
describe('diliDay', () => {
  it('moves to the next day from 15:00 UTC, which is midnight in Dili', () => {
    expect(diliDay(new Date('2026-06-01T14:59:59.999Z'))).toBe('2026-06-01');
    expect(diliDay(new Date('2026-06-01T15:00:00.000Z'))).toBe('2026-06-02');
  });

  it('crosses month and year ends and leap days', () => {
    expect(diliDay(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
    expect(diliDay(new Date('2028-02-28T15:00:00Z'))).toBe('2028-02-29');
    expect(diliDay(new Date('2027-02-28T15:00:00Z'))).toBe('2027-03-01');
  });
});

describe('isDiliDate', () => {
  it('accepts only real calendar days written YYYY-MM-DD', () => {
    for (const ok of ['2026-06-01', '2028-02-29', '2026-12-31'])
      expect(isDiliDate(ok), ok).toBe(true);
    for (const bad of [
      '2027-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-06-31',
      '2026-6-1',
      '26-06-01',
      '2026-06-01 ',
      '',
      'today',
      '2026-06-01T00:00',
    ])
      expect(isDiliDate(bad), bad).toBe(false);
  });
});

describe('diliDayStartUtc', () => {
  it('is 15:00 UTC on the day before', () => {
    expect(diliDayStartUtc('2026-06-01')).toBe('2026-05-31T15:00:00.000Z');
    expect(diliDayStartUtc('2026-01-01')).toBe('2025-12-31T15:00:00.000Z');
  });
});

describe('addDays', () => {
  it('adds and subtracts calendar days', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-06-10', -29)).toBe('2026-05-12');
  });
});
