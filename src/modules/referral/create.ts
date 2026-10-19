export type CreateResult =
  | { ok: true; id: number }
  | {
      ok: false;
      error:
        | 'invalid'
        | 'not_found'
        | 'no_consent'
        | 'not_approved'
        | 'already_active';
    };

/**
 * Passes an enquiry to a tailor (FR-REF-01/02/07, BR-08). The enquiry must hold sharing consent and live data, the tailor must be approved,
 * and no other referral for it may still be pending or accepted. The last rule sits inside the INSERT, so two admins acting at once
 * cannot both succeed; the database triggers remain the backstop for the first two. Only ids are audited.
 */
export async function createReferral(
  db: D1Database,
  args: { enquiryId: number; tailorId: number; userId: number },
): Promise<CreateResult> {
  const { enquiryId, tailorId, userId } = args;
  if (!Number.isInteger(enquiryId) || !Number.isInteger(tailorId))
    return { ok: false, error: 'invalid' };

  const enquiry = await db
    .prepare(
      'SELECT consent_shared_with_tailor AS consent, anonymised_at FROM enquiry WHERE id = ?',
    )
    .bind(enquiryId)
    .first<{ consent: number; anonymised_at: string | null }>();
  const tailor = await db
    .prepare('SELECT status FROM tailor WHERE id = ?')
    .bind(tailorId)
    .first<{ status: string }>();
  if (!enquiry || !tailor) return { ok: false, error: 'not_found' };
  if (enquiry.consent !== 1 || enquiry.anonymised_at !== null)
    return { ok: false, error: 'no_consent' };
  if (tailor.status !== 'approved') return { ok: false, error: 'not_approved' };

  try {
    const [insert] = await db.batch([
      db
        .prepare(
          `INSERT INTO referral (enquiry_id, tailor_id) SELECT ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM referral WHERE enquiry_id = ? AND tailor_response IN ('pending', 'accepted'))`,
        )
        .bind(enquiryId, tailorId, enquiryId),
      db
        .prepare(
          "INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT ?, 'referral_created', 'referral', last_insert_rowid() WHERE changes() > 0",
        )
        .bind(userId),
    ]);
    return insert.meta.changes === 0
      ? { ok: false, error: 'already_active' }
      : { ok: true, id: insert.meta.last_row_id as number };
  } catch (error) {
    // A trigger refused it (state changed after the checks above).
    const text = String(error);
    if (text.includes('approved tailor'))
      return { ok: false, error: 'not_approved' };
    if (text.includes('sharing consent'))
      return { ok: false, error: 'no_consent' };
    throw error;
  }
}
