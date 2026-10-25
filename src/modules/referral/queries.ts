export type Referral = {
  id: number;
  tailor_id: number;
  tailor_name: string;
  /** The tailor's own number for a WhatsApp message: public WhatsApp, else private phone, else public phone (admin pages only). */
  tailor_number: string | null;
  forwarded_at: string | null;
  forwarded_via: string | null;
  fields_shared_note: string | null;
  tailor_response: 'pending' | 'accepted' | 'declined' | 'no_response';
  responded_at: string | null;
  completion_reported_at: string | null;
  completion_reported_by: string | null;
  closed_reason: string | null;
  created_at: string;
};
/** Present only for a caller who holds `fee.view` (owner): managers never receive these columns (BR-09, BR-10). */
export type ReferralFees = {
  order_value_note: string | null;
  fee_basis_note: string | null;
  fee_amount: number | null;
  fee_status: 'not_due' | 'due' | 'paid' | 'waived' | 'disputed';
  fee_paid_at: string | null;
};

const BASE = `r.id, r.tailor_id, t.display_name AS tailor_name, COALESCE(t.whatsapp_e164, t.private_phone, t.phone_e164) AS tailor_number, r.forwarded_at, r.forwarded_via, r.fields_shared_note, r.tailor_response,
  r.responded_at, r.completion_reported_at, r.completion_reported_by, r.closed_reason, r.created_at`;
const FEES =
  'r.order_value_note, r.fee_basis_note, r.fee_amount, r.fee_status, r.fee_paid_at';

export function listReferrals(
  db: D1Database,
  enquiryId: number,
  opts: { withFees: true },
): Promise<(Referral & ReferralFees)[]>;
export function listReferrals(
  db: D1Database,
  enquiryId: number,
  opts: { withFees: false },
): Promise<Referral[]>;
export function listReferrals(
  db: D1Database,
  enquiryId: number,
  opts: { withFees: boolean },
): Promise<(Referral & Partial<ReferralFees>)[]>;
export async function listReferrals(
  db: D1Database,
  enquiryId: number,
  opts: { withFees: boolean },
) {
  const { results } = await db
    .prepare(
      `SELECT ${BASE}${opts.withFees ? `, ${FEES}` : ''} FROM referral r JOIN tailor t ON t.id = r.tailor_id WHERE r.enquiry_id = ? ORDER BY r.created_at, r.id`,
    )
    .bind(enquiryId)
    .all();
  return results;
}

/** Tailors a referral may go to (approved only); the customer's preferred tailor comes first. */
export async function approvedTailors(
  db: D1Database,
  preferredId: number | null,
): Promise<{ id: number; display_name: string }[]> {
  const { results } = await db
    .prepare(
      "SELECT id, display_name FROM tailor WHERE status = 'approved' ORDER BY (id = ?) DESC, display_name",
    )
    .bind(preferredId ?? -1)
    .all<{ id: number; display_name: string }>();
  return results;
}
