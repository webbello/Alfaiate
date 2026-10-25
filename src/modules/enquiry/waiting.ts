/** A request that has had no reply for this long gets a visible flag (FR-ADM-12). */
export const REPLY_WITHIN_HOURS = 24;

/** True for a real request still New after the reply window; anything already answered, and spam, is never flagged. */
export function waitingTooLong(
  row: { status: string; is_spam: number; created_at: string },
  now = new Date(),
): boolean {
  if (row.status !== 'new' || row.is_spam) return false;
  const waited = now.getTime() - new Date(row.created_at).getTime();
  return waited >= REPLY_WITHIN_HOURS * 3_600_000;
}
