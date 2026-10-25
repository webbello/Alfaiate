import { describe, expect, it } from 'vitest';
import {
  REPLY_WITHIN_HOURS,
  waitedText,
  waitingTooLong,
} from '../../src/modules/enquiry/waiting';

const NOW = new Date('2026-06-02T09:00:00.000Z');
const row = (
  hoursAgo: number,
  over: Partial<{ status: string; is_spam: number }> = {},
) => ({
  status: 'new',
  is_spam: 0,
  created_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
  ...over,
});

describe('waitingTooLong (FR-ADM-12)', () => {
  it('flags a New request from exactly the reply window on', () => {
    expect(REPLY_WITHIN_HOURS).toBe(24);
    expect(waitingTooLong(row(23.9), NOW)).toBe(false);
    expect(waitingTooLong(row(24), NOW)).toBe(true);
    expect(waitingTooLong(row(100), NOW)).toBe(true);
  });

  it('never flags an answered request or spam', () => {
    expect(waitingTooLong(row(100, { status: 'contacted' }), NOW)).toBe(false);
    expect(waitingTooLong(row(100, { status: 'cancelled' }), NOW)).toBe(false);
    expect(waitingTooLong(row(100, { is_spam: 1 }), NOW)).toBe(false);
  });
});

describe('waitedText', () => {
  const at = (minutesAgo: number) =>
    waitedText(
      new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
      NOW,
    );
  it('says it in the unit a person would', () => {
    expect(at(0)).toBe('just now');
    expect(at(4)).toBe('just now');
    expect(at(5)).toBe('5 min');
    expect(at(59)).toBe('59 min');
    expect(at(60)).toBe('1 h');
    expect(at(47 * 60 + 59)).toBe('47 h');
    expect(at(48 * 60)).toBe('2 days');
    expect(at(10 * 24 * 60)).toBe('10 days');
    expect(waitedText('2999-01-01T00:00:00.000Z', NOW)).toBe('just now'); // a clock slip never prints a negative time
  });
});
