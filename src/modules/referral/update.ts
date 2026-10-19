import { diliDay, isDiliDate } from './dates';

export type UpdateResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'not_found' | 'forbidden' | 'has_fee' };

const VIA = ['whatsapp', 'phone', 'sms', 'in_person', 'other'];
const RESPONSE = ['pending', 'accepted', 'declined', 'no_response'];
const REPORTER = ['tailor', 'customer', 'owner_confirmed'];

/**
 * Records forwarding, the tailor's response and the reported completion (FR-REF-03/04/05). Completion is a report, not a verified fact (BR-10):
 * only the owner can mark it `owner_confirmed`, and a manager cannot change or clear one the owner confirmed. Fees are not touched here.
 * Edits overwrite; the audit row holds ids only. The referral must belong to the enquiry in the URL.
 */
export async function updateReferral(
  db: D1Database,
  args: {
    enquiryId: number;
    referralId: number;
    userId: number;
    role: string;
    input: Record<string, string>;
    now?: Date;
  },
): Promise<UpdateResult> {
  const { enquiryId, referralId, userId, role } = args;
  const text = (key: string) => (args.input[key] ?? '').trim();
  const date = (key: string): string | null | undefined => {
    const value = text(key);
    return value === '' ? null : isDiliDate(value) ? value : undefined;
  };

  const forwardedAt = date('forwarded_at');
  const via = text('forwarded_via');
  const shared = text('fields_shared_note');
  const response = text('tailor_response');
  let respondedAt = date('responded_at');
  const completedAt = date('completion_reported_at');
  const by = text('completion_reported_by');
  const closed = text('closed_reason');

  if (
    forwardedAt === undefined ||
    respondedAt === undefined ||
    completedAt === undefined ||
    (via !== '' && !VIA.includes(via)) ||
    !RESPONSE.includes(response) ||
    (by !== '' && !REPORTER.includes(by)) ||
    (completedAt === null) !== (by === '') ||
    shared.length > 500 ||
    closed.length > 300
  )
    return { ok: false, error: 'invalid' };

  if (response === 'pending') respondedAt = null;
  else if (respondedAt === null) respondedAt = diliDay(args.now ?? new Date());

  const current = await db
    .prepare(
      'SELECT completion_reported_at AS at, completion_reported_by AS by FROM referral WHERE id = ? AND enquiry_id = ?',
    )
    .bind(referralId, enquiryId)
    .first<{ at: string | null; by: string | null }>();
  if (!current) return { ok: false, error: 'not_found' };

  if (role !== 'owner') {
    // Re-posting an unchanged confirmed completion is fine; setting, changing or clearing one is the owner's.
    const unchanged = current.at === completedAt && current.by === (by || null);
    const touchesConfirmed =
      !unchanged &&
      (by === 'owner_confirmed' || current.by === 'owner_confirmed');
    if (touchesConfirmed) return { ok: false, error: 'forbidden' };
  }

  try {
    await db.batch([
      db
        .prepare(
          `UPDATE referral SET forwarded_at = ?, forwarded_via = ?, fields_shared_note = ?, tailor_response = ?, responded_at = ?,
             completion_reported_at = ?, completion_reported_by = ?, closed_reason = ?, updated_at = ? WHERE id = ? AND enquiry_id = ?`,
        )
        .bind(
          forwardedAt,
          via || null,
          shared || null,
          response,
          respondedAt,
          completedAt,
          by || null,
          closed || null,
          new Date().toISOString(),
          referralId,
          enquiryId,
        ),
      db
        .prepare(
          "INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT ?, 'referral_updated', 'referral', ? WHERE changes() > 0",
        )
        .bind(userId, referralId),
    ]);
  } catch (error) {
    // The database refuses to clear a completion while a fee is recorded.
    if (String(error).includes('CHECK constraint'))
      return { ok: false, error: 'has_fee' };
    throw error;
  }
  return { ok: true };
}
