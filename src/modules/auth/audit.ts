export type AuditAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'user_created'
  | 'role_changed'
  | 'user_deactivated'
  | 'user_reactivated'
  | 'password_changed'
  | 'tailor_created'
  | 'tailor_updated'
  | 'tailor_published'
  | 'tailor_unpublished'
  | 'image_uploaded'
  | 'image_changed'
  | 'image_deleted'
  | 'catalog_changed'
  | 'fee_terms_changed'
  | 'enquiry_status_changed'
  | 'interest_anonymised'
  | 'newsletter_removed'
  | 'enquiry_spam_changed'
  | 'referral_created'
  | 'referral_updated'
  | 'referral_fee_updated'
  | 'enquiry_anonymised'
  | 'interest_approved'
  | 'interest_declined'
  | 'tailor_invite_issued'
  | 'portal_login'
  | 'portal_login_failed'
  | 'portal_account_activated'
  | 'portal_profile_updated'
  | 'portal_work_updated'
  | 'portal_image_uploaded'
  | 'portal_image_changed'
  | 'portal_image_deleted'
  | 'portal_submitted';

type Entry = {
  userId: number | null;
  /** Set instead of `userId` when a tailor, not staff, did it. */
  tailorAccountId?: number;
  action: AuditAction;
  entityType?: string;
  entityId?: number;
};

/** Append-only. Takes ids only, so customer data cannot reach the log (SEC-05, SEC-09). */
export async function audit(db: D1Database, entry: Entry): Promise<void> {
  await db
    .prepare(
      'INSERT INTO audit_log (admin_user_id, tailor_account_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(
      entry.userId,
      entry.tailorAccountId ?? null,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
    )
    .run();
}
