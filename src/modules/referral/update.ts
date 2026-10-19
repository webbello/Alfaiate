import { diliDay, isDiliDate } from './dates';

export type UpdateResult =
  | { ok: true }
  | {
      ok: false;
      error:
        'invalid' | 'not_found' | 'forbidden' | 'has_fee' | 'already_active';
    };

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

  // The statement repeats the rules, so a change made by someone else between the checks above and this write is caught too:
  // no second active referral for the enquiry, and (for a manager) no overwriting a completion that changed meanwhile.
  const wantsActive = response === 'pending' || response === 'accepted';
  const guard =
    role === 'owner'
      ? ''
      : ' AND completion_reported_at IS ? AND completion_reported_by IS ?';
  const binds: (string | number | null)[] = [
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
    wantsActive ? 1 : 0,
    enquiryId,
    referralId,
    ...(role === 'owner' ? [] : [current.at, current.by]),
  ];
  let changes: number;
  try {
    const [update] = await db.batch([
      db
        .prepare(
          `UPDATE referral SET forwarded_at = ?, forwarded_via = ?, fields_shared_note = ?, tailor_response = ?, responded_at = ?,
             completion_reported_at = ?, completion_reported_by = ?, closed_reason = ?, updated_at = ?
           WHERE id = ? AND enquiry_id = ?
             AND (? = 0 OR NOT EXISTS (SELECT 1 FROM referral o WHERE o.enquiry_id = ? AND o.id <> ? AND o.tailor_response IN ('pending', 'accepted')))${guard}`,
        )
        .bind(...binds),
      db
        .prepare(
          "INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT ?, 'referral_updated', 'referral', ? WHERE changes() > 0",
        )
        .bind(userId, referralId),
    ]);
    changes = update.meta.changes;
  } catch (error) {
    // The database refuses to clear a completion while a fee is recorded. Only the owner may be told a fee exists.
    if (String(error).includes('CHECK constraint'))
      return { ok: false, error: role === 'owner' ? 'has_fee' : 'invalid' };
    throw error;
  }
  if (changes === 0) {
    const other = wantsActive
      ? await db
          .prepare(
            "SELECT 1 FROM referral WHERE enquiry_id = ? AND id <> ? AND tailor_response IN ('pending', 'accepted')",
          )
          .bind(enquiryId, referralId)
          .first()
      : null;
    if (other) return { ok: false, error: 'already_active' };
    return { ok: false, error: role === 'owner' ? 'not_found' : 'forbidden' };
  }
  return { ok: true };
}
