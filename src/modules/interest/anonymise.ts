export type AnonymiseResult =
  'ok' | 'already' | 'wrong_reference' | 'not_found';

/** Removes a tailor's personal details from an interest record (PRV-04 applied to this table). Irreversible, so the reference code must be typed. An audit row with ids only is written in the same batch. */
export async function anonymiseInterest(
  db: D1Database,
  args: { id: number; reference: string; userId: number },
): Promise<AnonymiseResult> {
  const row = await db
    .prepare(
      'SELECT reference_code, anonymised_at FROM tailor_interest WHERE id = ?',
    )
    .bind(args.id)
    .first<{ reference_code: string; anonymised_at: string | null }>();
  if (!row) return 'not_found';
  if (row.anonymised_at !== null) return 'already';
  if (args.reference.trim().toUpperCase() !== row.reference_code)
    return 'wrong_reference';
  const at = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        'UPDATE tailor_interest SET contact_name = NULL, business_name = NULL, phone_e164 = NULL, area_text = NULL, craft_text = NULL, message = NULL, anonymised_at = ? WHERE id = ? AND anonymised_at IS NULL',
      )
      .bind(at, args.id),
    // written only if the update above ran, so two clicks at once leave one audit row
    db
      .prepare(
        "INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT ?, 'interest_anonymised', 'tailor_interest', id FROM tailor_interest WHERE id = ? AND anonymised_at = ?",
      )
      .bind(args.userId, args.id, at),
  ]);
  return 'ok';
}
