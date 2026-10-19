import { describe, expect, it } from 'vitest';
import { parsePeriod, periodRange } from '../../src/modules/reporting/period';

describe('parsePeriod', () => {
  it('knows three periods and falls back to this month', () => {
    expect(parsePeriod('month')).toBe('month');
    expect(parsePeriod('30d')).toBe('30d');
    expect(parsePeriod('all')).toBe('all');
    for (const bad of [null, '', 'week', 'MONTH', "month'--", '30D'])
      expect(parsePeriod(bad), String(bad)).toBe('month');
  });
});

describe('periodRange', () => {
  const now = new Date('2026-06-15T10:00:00Z'); // 19:00 on 15 June in Dili

  it('this month is the Dili calendar month, start inclusive and end exclusive', () => {
    expect(periodRange('month', now)).toEqual({
      fromDay: '2026-06-01',
      toDay: '2026-07-01',
      fromUtc: '2026-05-31T15:00:00.000Z',
      toUtc: '2026-06-30T15:00:00.000Z',
    });
  });

  it('uses the Dili day, not the UTC day, to choose the month', () => {
    // 20:00 UTC on 30 June is already 1 July in Dili
    expect(periodRange('month', new Date('2026-06-30T20:00:00Z')).fromDay).toBe(
      '2026-07-01',
    );
    expect(periodRange('month', new Date('2026-06-30T14:59:00Z')).fromDay).toBe(
      '2026-06-01',
    );
  });

  it('rolls over December to January', () => {
    expect(
      periodRange('month', new Date('2026-12-10T00:00:00Z')),
    ).toMatchObject({ fromDay: '2026-12-01', toDay: '2027-01-01' });
  });

  it('the last 30 days include today and the 29 days before it', () => {
    expect(periodRange('30d', now)).toEqual({
      fromDay: '2026-05-17',
      toDay: '2026-06-16',
      fromUtc: '2026-05-16T15:00:00.000Z',
      toUtc: '2026-06-15T15:00:00.000Z',
    });
  });

  it('all time has no bounds', () => {
    expect(periodRange('all', now)).toEqual({
      fromDay: null,
      toDay: null,
      fromUtc: null,
      toUtc: null,
    });
  });
});
