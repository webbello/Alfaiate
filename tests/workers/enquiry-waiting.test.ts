import { describe, expect, it } from 'vitest';
import {
  REPLY_WITHIN_HOURS,
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
