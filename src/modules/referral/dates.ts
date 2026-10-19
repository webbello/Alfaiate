// Dates typed by an admin are Dili calendar days (UTC+9, no daylight saving), stored as plain `YYYY-MM-DD` text.
const HOUR = 3_600_000;
const DILI_OFFSET = 9 * HOUR;

/** The Dili calendar day of an instant. */
export const diliDay = (now: Date): string =>
  new Date(now.getTime() + DILI_OFFSET).toISOString().slice(0, 10);

/** True only for a real calendar day written exactly `YYYY-MM-DD`. */
export function isDiliDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** The instant a Dili day starts, as a UTC timestamp comparable with `created_at`. */
export const diliDayStartUtc = (day: string): string =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() - DILI_OFFSET).toISOString();

export const addDays = (day: string, days: number): string =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 24 * HOUR)
    .toISOString()
    .slice(0, 10);
