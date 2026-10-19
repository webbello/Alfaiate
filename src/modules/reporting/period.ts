import { addDays, diliDay, diliDayStartUtc } from '../referral/dates';

export type Period = 'month' | '30d' | 'all';
export const PERIODS: readonly Period[] = ['month', '30d', 'all'];

/** Anything unknown means this month, so a hostile `?period=` can only ever pick one of three ranges. */
export const parsePeriod = (value: string | null): Period =>
  PERIODS.find((p) => p === value) ?? 'month';

/** Start inclusive, end exclusive, as Dili days (for recorded dates) and as UTC timestamps (for `created_at`). */
export type Range = {
  fromDay: string | null;
  toDay: string | null;
  fromUtc: string | null;
  toUtc: string | null;
};

export function periodRange(period: Period, now = new Date()): Range {
  if (period === 'all')
    return { fromDay: null, toDay: null, fromUtc: null, toUtc: null };
  const today = diliDay(now);
  let fromDay: string;
  let toDay: string;
  if (period === '30d') {
    fromDay = addDays(today, -29);
    toDay = addDays(today, 1);
  } else {
    fromDay = `${today.slice(0, 8)}01`;
    toDay = `${addDays(fromDay, 31).slice(0, 8)}01`; // 31 days after the 1st is always in the next month
  }
  return {
    fromDay,
    toDay,
    fromUtc: diliDayStartUtc(fromDay),
    toUtc: diliDayStartUtc(toDay),
  };
}
