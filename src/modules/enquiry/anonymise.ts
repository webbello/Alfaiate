export type AnonymiseResult =
  'ok' | 'already' | 'wrong_reference' | 'not_found';

/**
 * Removes a customer's personal data from an enquiry on request (PRV-04, FR-ADM-09). Irreversible, so the reference code must be typed.
 * One batch: the six personal columns and `anonymised_at`; the free text on its referrals (what was shared, why it ended, the order note);
 * its internal notes (they can quote the customer); and an audit row with ids only. Status, status log, category, area, dates, source,
 * referral rows and fee fields stay, because reporting needs them. Nothing is automatic and nothing is hard-deleted.
 * Backups taken earlier still hold the old data until they expire (stated in the privacy review).
 */
export async function anonymiseEnquiry(
  db: D1Database,
  args: { id: number; reference: string; userId: number },
): Promise<AnonymiseResult> {
  const { id, userId } = args;
  const row = await db
    .prepare('SELECT reference_code, anonymised_at FROM enquiry WHERE id = ?')
    .bind(id)
    .first<{ reference_code: string; anonymised_at: string | null }>();
  if (!row) return 'not_found';
  if (row.anonymised_at !== null) return 'already';
  if (args.reference.trim().toUpperCase() !== row.reference_code)
    return 'wrong_reference';

  const at = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE enquiry SET customer_name = NULL, contact_number_e164 = NULL, notes = NULL, service_description = NULL, area_text = NULL,
           preferred_datetime_text = NULL, anonymised_at = ?, updated_at = ? WHERE id = ? AND anonymised_at IS NULL`,
      )
      .bind(at, at, id),
    db
      .prepare(
        'UPDATE referral SET fields_shared_note = NULL, closed_reason = NULL, order_value_note = NULL WHERE enquiry_id = ?',
      )
      .bind(id),
    db.prepare('DELETE FROM internal_note WHERE enquiry_id = ?').bind(id),
    db
      .prepare(
        "INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT ?, 'enquiry_anonymised', 'enquiry', id FROM enquiry WHERE id = ? AND anonymised_at = ?",
      )
      .bind(userId, id, at),
  ]);
  return 'ok';
}
