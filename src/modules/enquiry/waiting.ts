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

/** How long a request has been waiting, in words for a phone card: "just now", "40 min", "5 h", "3 days". */
export function waitedText(createdAt: string, now = new Date()): string {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60_000),
  );
  if (minutes < 5) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}
