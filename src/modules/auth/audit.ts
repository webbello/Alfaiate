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
  | 'enquiry_status_changed';

type Entry = {
  userId: number | null;
  action: AuditAction;
  entityType?: string;
  entityId?: number;
};

/** Append-only. Takes ids only, so customer data cannot reach the log (SEC-05, SEC-09). */
export async function audit(db: D1Database, entry: Entry): Promise<void> {
  await db
    .prepare(
      'INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)',
    )
    .bind(
      entry.userId,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
    )
    .run();
}
