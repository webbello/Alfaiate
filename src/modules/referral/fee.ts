import { can } from '../auth/permissions';
import { dollarsToCents } from '../tailors/links';
import { isDiliDate } from './dates';

export type FeeResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'forbidden'
        | 'invalid'
        | 'not_found'
        | 'needs_completion'
        | 'needs_paid_date'
        | 'no_agreed_terms';
    };

const STATUS = ['not_due', 'due', 'paid', 'waived', 'disputed'];
const MAX_CENTS = 1_000_000 * 100;

/**
 * Records the referral fee by hand (FR-REF-06). Owner only (`fee.view`). Nothing is calculated, suggested or defaulted: the owner types
 * the amount in dollars. An amount needs a reported completion (BR-10); `due` or `paid` needs the tailor's fee terms to have an agreed
 * date (BR-09); `paid` needs a paid date. The audit row holds ids only, never amounts or notes.
 */
export async function setFee(
  db: D1Database,
  args: {
    enquiryId: number;
    referralId: number;
    userId: number;
    role: string;
    input: Record<string, string>;
  },
): Promise<FeeResult> {
  const { enquiryId, referralId, userId } = args;
  if (!can(args.role, 'fee.view')) return { ok: false, error: 'forbidden' };
  const text = (key: string) => (args.input[key] ?? '').trim();

  let cents: number | null;
  try {
    cents = dollarsToCents(text('fee_amount'));
  } catch {
    return { ok: false, error: 'invalid' };
  }
  const status = text('fee_status');
  const paidAt = text('fee_paid_at');
  const basis = text('fee_basis_note');
  const orderValue = text('order_value_note');
  if (
    (cents !== null && cents > MAX_CENTS) ||
    !STATUS.includes(status) ||
    (paidAt !== '' && !isDiliDate(paidAt)) ||
    basis.length > 300 ||
    orderValue.length > 300
  )
    return { ok: false, error: 'invalid' };

  const row = await db
    .prepare(
      `SELECT r.completion_reported_at AS completed, t.fee_terms_agreed_on AS terms FROM referral r JOIN tailor t ON t.id = r.tailor_id
       WHERE r.id = ? AND r.enquiry_id = ?`,
    )
    .bind(referralId, enquiryId)
    .first<{ completed: string | null; terms: string | null }>();
  if (!row) return { ok: false, error: 'not_found' };
  if (cents !== null && row.completed === null)
    return { ok: false, error: 'needs_completion' };
  if ((status === 'due' || status === 'paid') && row.terms === null)
    return { ok: false, error: 'no_agreed_terms' };
  if (status === 'paid' && paidAt === '')
    return { ok: false, error: 'needs_paid_date' };

  await db.batch([
    db
      .prepare(
        `UPDATE referral SET fee_amount = ?, fee_basis_note = ?, order_value_note = ?, fee_status = ?, fee_paid_at = ?, updated_at = ?
         WHERE id = ? AND enquiry_id = ?`,
      )
      .bind(
        cents,
        basis || null,
        orderValue || null,
        status,
        status === 'paid' ? paidAt : null,
        new Date().toISOString(),
        referralId,
        enquiryId,
      ),
    db
      .prepare(
        "INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT ?, 'referral_fee_updated', 'referral', ? WHERE changes() > 0",
      )
      .bind(userId, referralId),
  ]);
  return { ok: true };
}
