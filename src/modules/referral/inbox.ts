import { audit } from '../auth/audit';
import { diliDay } from './dates';

/**
 * The tailor's inbox (FR-TPO-09..12, docs/SPEC-tailor-inbox.md). A referral reaches a tailor's portal only when staff send it there; the tailor then sees what is asked
 * (clothing type, neighbourhood name, preferred time) and nothing about who asks until they accept. The customer's fields are chosen inside the SQL (CASE), so a state that
 * must not show them never even reads them. Every read is `referral.tailor_id = <the signed-in tailor> AND shared_to_inbox_at IS NOT NULL`.
 * Statuses of the request stay manual: an answer is recorded on the referral only.
 */
export const DECLINE_REASONS = [
  'too_far',
  'too_busy',
  'not_my_work',
  'other',
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

/** Request statuses after which a tailor sees no customer details any more. */
const CLOSED = ['completed_reported', 'not_converted', 'cancelled'];
const closedSql = `(e.anonymised_at IS NOT NULL OR e.is_spam = 1 OR e.status IN (${CLOSED.map((s) => `'${s}'`).join(', ')}))`;

export type InboxState = 'waiting' | 'accepted' | 'declined' | 'closed';
export type InboxItem = {
  id: number;
  reference: string;
  state: InboxState;
  /** What is asked: always shown. */
  category: string | null;
  area: string | null;
  preferredTime: string | null;
  sentAt: string;
  declineReason: DeclineReason | null;
  /** Only when the tailor accepted and the request is still open. */
  contact: {
    name: string | null;
    number: string | null;
    channel: string | null;
    areaText: string | null;
    notes: string | null;
  } | null;
};

type Row = {
  id: number;
  tailor_response: 'pending' | 'accepted' | 'declined' | 'no_response';
  decline_reason: DeclineReason | null;
  shared_to_inbox_at: string;
  reference_code: string;
  closed: number;
  category: string | null;
  area: string | null;
  preferred: string | null;
  name: string | null;
  number: string | null;
  channel: string | null;
  area_text: string | null;
  notes: string | null;
};

const open = `(r.tailor_response = 'accepted' AND NOT ${closedSql})`;
const SELECT = `SELECT r.id, r.tailor_response, r.decline_reason, r.shared_to_inbox_at, e.reference_code, ${closedSql} AS closed,
    c.name AS category, a.name AS area, e.preferred_datetime_text AS preferred,
    CASE WHEN ${open} THEN e.customer_name END AS name,
    CASE WHEN ${open} THEN e.contact_number_e164 END AS number,
    CASE WHEN ${open} THEN e.contact_channel END AS channel,
    CASE WHEN ${open} THEN e.area_text END AS area_text,
    CASE WHEN ${open} THEN e.notes END AS notes
  FROM referral r JOIN enquiry e ON e.id = r.enquiry_id
  LEFT JOIN garment_category c ON c.id = e.garment_category_id
  LEFT JOIN service_area a ON a.id = e.area_id
  WHERE r.tailor_id = ? AND r.shared_to_inbox_at IS NOT NULL`;

function toItem(r: Row): InboxItem {
  const state: InboxState = r.closed
    ? 'closed'
    : r.tailor_response === 'accepted'
      ? 'accepted'
      : r.tailor_response === 'declined'
        ? 'declined'
        : 'waiting';
  return {
    id: r.id,
    reference: r.reference_code,
    state,
    category: r.category,
    area: r.area,
    preferredTime: r.preferred,
    sentAt: r.shared_to_inbox_at,
    declineReason: r.tailor_response === 'declined' ? r.decline_reason : null,
    contact:
      state === 'accepted'
        ? {
            name: r.name,
            number: r.number,
            channel: r.channel,
            areaText: r.area_text,
            notes: r.notes,
          }
        : null,
  };
}

/** Everything staff sent to this tailor, newest first. */
export async function listInbox(
  db: D1Database,
  tailorId: number,
): Promise<InboxItem[]> {
  const { results } = await db
    .prepare(
      `${SELECT} ORDER BY r.shared_to_inbox_at DESC, r.id DESC LIMIT 100`,
    )
    .bind(tailorId)
    .all<Row>();
  return results.map(toItem);
}

/** One item, or null for any id that is not this tailor's or was not sent to the inbox (the same answer, so nothing can be probed). */
export async function getInboxItem(
  db: D1Database,
  tailorId: number,
  referralId: number,
): Promise<InboxItem | null> {
  const row = await db
    .prepare(`${SELECT} AND r.id = ?`)
    .bind(tailorId, referralId)
    .first<Row>();
  return row ? toItem(row) : null;
}

/** How many sent requests still wait for this tailor's answer (the overview and the tab). */
export async function waitingCount(
  db: D1Database,
  tailorId: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT count(*) AS n FROM referral r JOIN enquiry e ON e.id = r.enquiry_id
       WHERE r.tailor_id = ? AND r.shared_to_inbox_at IS NOT NULL AND r.tailor_response IN ('pending', 'no_response') AND NOT ${closedSql}`,
    )
    .bind(tailorId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export type AnswerResult =
  'ok' | 'not_found' | 'already_answered' | 'closed' | 'invalid';

/**
 * The tailor's one answer. Found by the signed-in tailor's id and only once staff sent it; only while it still waits (staff can change it later); never for a closed or
 * anonymised request. Audited with the tailor as actor, ids only.
 */
export async function answerReferral(
  db: D1Database,
  session: { tailorId: number; accountId: number },
  referralId: number,
  input: { answer: string; reason?: string },
  now = new Date(),
): Promise<AnswerResult> {
  const item = await getInboxItem(db, session.tailorId, referralId);
  if (!item) return 'not_found';
  if (item.state === 'closed') return 'closed';
  if (item.state !== 'waiting') return 'already_answered';
  if (input.answer !== 'accept' && input.answer !== 'decline') return 'invalid';
  const reason = input.answer === 'decline' ? (input.reason ?? '') : '';
  if (reason !== '' && !(DECLINE_REASONS as readonly string[]).includes(reason))
    return 'invalid';
  const done = await db
    .prepare(
      `UPDATE referral SET tailor_response = ?, responded_at = ?, decline_reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND tailor_id = ? AND shared_to_inbox_at IS NOT NULL AND tailor_response IN ('pending', 'no_response')`,
    )
    .bind(
      input.answer === 'accept' ? 'accepted' : 'declined',
      diliDay(now),
      reason || null,
      referralId,
      session.tailorId,
    )
    .run();
  if (done.meta.changes !== 1) return 'already_answered';
  await audit(db, {
    userId: null,
    tailorAccountId: session.accountId,
    action: 'referral_tailor_answered',
    entityType: 'referral',
    entityId: referralId,
  });
  return 'ok';
}

export type SendResult =
  | 'ok'
  | 'not_found'
  | 'unchanged'
  | 'closed'
  | 'locked_anonymised'
  | 'accepted';

/** Staff: send one referral to its tailor's inbox (the referral must belong to the enquiry in the address). Refused for a closed, spam or anonymised request. */
export async function sendToInbox(
  db: D1Database,
  args: { enquiryId: number; referralId: number; userId: number },
): Promise<SendResult> {
  const row = await db
    .prepare(
      `SELECT r.shared_to_inbox_at, e.anonymised_at, ${closedSql} AS closed FROM referral r JOIN enquiry e ON e.id = r.enquiry_id WHERE r.id = ? AND r.enquiry_id = ?`,
    )
    .bind(args.referralId, args.enquiryId)
    .first<{
      shared_to_inbox_at: string | null;
      anonymised_at: string | null;
      closed: number;
    }>();
  if (!row) return 'not_found';
  if (row.anonymised_at) return 'locked_anonymised';
  if (row.closed) return 'closed';
  if (row.shared_to_inbox_at) return 'unchanged';
  await db
    .prepare(
      `UPDATE referral SET shared_to_inbox_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND shared_to_inbox_at IS NULL`,
    )
    .bind(args.referralId)
    .run();
  await audit(db, {
    userId: args.userId,
    action: 'referral_inbox_sent',
    entityType: 'referral',
    entityId: args.referralId,
  });
  return 'ok';
}

/** Staff: hide it again. Not once the tailor accepted (they already hold the details: staff decide that with the tailor). */
export async function takeBackFromInbox(
  db: D1Database,
  args: { enquiryId: number; referralId: number; userId: number },
): Promise<SendResult> {
  const row = await db
    .prepare(
      'SELECT shared_to_inbox_at, tailor_response FROM referral WHERE id = ? AND enquiry_id = ?',
    )
    .bind(args.referralId, args.enquiryId)
    .first<{ shared_to_inbox_at: string | null; tailor_response: string }>();
  if (!row) return 'not_found';
  if (!row.shared_to_inbox_at) return 'unchanged';
  if (row.tailor_response === 'accepted') return 'accepted';
  await db
    .prepare(
      `UPDATE referral SET shared_to_inbox_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    )
    .bind(args.referralId)
    .run();
  await audit(db, {
    userId: args.userId,
    action: 'referral_inbox_taken_back',
    entityType: 'referral',
    entityId: args.referralId,
  });
  return 'ok';
}
