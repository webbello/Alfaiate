import { STATUSES, type Status } from '../enquiry/queries';
import { periodRange, type Period } from './period';

export type Ratio = {
  numerator: number;
  denominator: number;
  /** `null` when the denominator is zero: shown as "no data", never as 0%. */
  value: number | null;
};
export type Fees = {
  /** Fee amounts in cents for referrals whose completion was reported in the period. */
  due: number;
  disputed: number;
  paid: number;
  /** M9: paid ÷ (paid + due + disputed), by amount; waived fees are left out. */
  m9: Ratio;
  /** M7: fees marked paid whose paid date falls in the period. */
  m7: number;
};
export type Metrics = {
  period: Period;
  /** M1: enquiries received (spam excluded). */
  enquiries: number;
  byStatus: Record<Status, number>;
  referralsForwarded: number;
  referralsAccepted: number;
  m2: Ratio;
  m3: Ratio;
  m4: Ratio;
  completions: number;
  /** M5: published tailors with a referral forwarded in the period. */
  activeTailors: number;
  /** M6: WhatsApp and phone taps, an indicator and not a confirmed contact. */
  contactClicks: number;
  /** M8: average hours from creation to the first move to "contacted" or "referred". */
  timeToFirstContact: { averageHours: number | null; count: number };
  /** Only present when the caller may see fees (owner). */
  fees?: Fees;
};

const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator,
  denominator,
  value: denominator === 0 ? null : numerator / denominator,
});

// A bound pair is `(? IS NULL OR col >= ?) AND (? IS NULL OR col < ?)`: start inclusive, end exclusive, no bounds for all time.
const between = (column: string) =>
  `(? IS NULL OR ${column} >= ?) AND (? IS NULL OR ${column} < ?)`;
const pair = (from: string | null, to: string | null) => [from, from, to, to];

/**
 * The dashboard figures (FR-RPT-01/02, ANA-04/05). Spam is excluded everywhere. Enquiries are placed in a period by their creation time,
 * recorded events (forwarded, completed, paid) by the Dili date typed in. Fee figures are queried only when `withFees` is set, so a caller
 * without `fee.view` never even reads them. Only counts and sums are selected, never a name, number or note.
 */
export async function metrics(
  db: D1Database,
  period: Period,
  opts: { withFees: boolean; now?: Date },
): Promise<Metrics> {
  const r = periodRange(period, opts.now);
  const created = pair(r.fromUtc, r.toUtc);
  const days = pair(r.fromDay, r.toDay);
  const enquiryFilter = `e.is_spam = 0 AND ${between('e.created_at')}`;

  const statements = [
    db
      .prepare(
        `SELECT e.status AS status, count(*) AS c FROM enquiry e WHERE ${enquiryFilter} GROUP BY e.status`,
      )
      .bind(...created),
    db
      .prepare(
        `SELECT count(*) AS c FROM enquiry e WHERE ${enquiryFilter} AND EXISTS (SELECT 1 FROM referral x WHERE x.enquiry_id = e.id)`,
      )
      .bind(...created),
    db
      .prepare(
        `SELECT count(*) AS forwarded, coalesce(sum(r.tailor_response = 'accepted'), 0) AS accepted,
                count(DISTINCT CASE WHEN t.is_published = 1 THEN r.tailor_id END) AS tailors
         FROM referral r JOIN enquiry e ON e.id = r.enquiry_id JOIN tailor t ON t.id = r.tailor_id
         WHERE e.is_spam = 0 AND r.forwarded_at IS NOT NULL AND ${between('r.forwarded_at')}`,
      )
      .bind(...days),
    db
      .prepare(
        `SELECT coalesce(sum(count), 0) AS c FROM contact_click_daily WHERE ${between('day')}`,
      )
      .bind(...days),
    db
      .prepare(
        `SELECT avg(hours) AS average, count(*) AS c FROM (
           SELECT (julianday(min(l.changed_at)) - julianday(e.created_at)) * 24 AS hours
           FROM enquiry e JOIN enquiry_status_log l ON l.enquiry_id = e.id AND l.to_status IN ('contacted', 'referred')
           WHERE ${enquiryFilter} GROUP BY e.id)`,
      )
      .bind(...created),
  ];
  if (opts.withFees)
    statements.push(
      db
        .prepare(
          `SELECT coalesce(sum(CASE WHEN r.fee_status = 'due' THEN r.fee_amount END), 0) AS due,
                  coalesce(sum(CASE WHEN r.fee_status = 'disputed' THEN r.fee_amount END), 0) AS disputed,
                  coalesce(sum(CASE WHEN r.fee_status = 'paid' THEN r.fee_amount END), 0) AS paid
           FROM referral r JOIN enquiry e ON e.id = r.enquiry_id
           WHERE e.is_spam = 0 AND r.completion_reported_at IS NOT NULL AND ${between('r.completion_reported_at')}`,
        )
        .bind(...days),
      db
        .prepare(
          `SELECT coalesce(sum(r.fee_amount), 0) AS c FROM referral r JOIN enquiry e ON e.id = r.enquiry_id
           WHERE e.is_spam = 0 AND r.fee_status = 'paid' AND r.fee_paid_at IS NOT NULL AND ${between('r.fee_paid_at')}`,
        )
        .bind(...days),
    );

  const results = await db.batch(statements);
  const one = <T>(i: number) => results[i].results[0] as T;

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
    Status,
    number
  >;
  for (const row of results[0].results as { status: Status; c: number }[])
    byStatus[row.status] = row.c;
  const enquiries = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const referred = one<{ c: number }>(1).c;
  const forward = one<{ forwarded: number; accepted: number; tailors: number }>(
    2,
  );
  const first = one<{ average: number | null; c: number }>(4);

  const out: Metrics = {
    period,
    enquiries,
    byStatus,
    referralsForwarded: forward.forwarded,
    referralsAccepted: forward.accepted,
    m2: ratio(referred, enquiries),
    m3: ratio(forward.accepted, forward.forwarded),
    m4: ratio(byStatus.completed_reported, enquiries),
    completions: byStatus.completed_reported,
    activeTailors: forward.tailors,
    contactClicks: one<{ c: number }>(3).c,
    timeToFirstContact: {
      averageHours:
        first.average === null ? null : Math.round(first.average * 100) / 100,
      count: first.c,
    },
  };
  if (opts.withFees) {
    const fee = one<{ due: number; disputed: number; paid: number }>(5);
    out.fees = {
      ...fee,
      m9: ratio(fee.paid, fee.paid + fee.due + fee.disputed),
      m7: one<{ c: number }>(6).c,
    };
  }
  return out;
}
