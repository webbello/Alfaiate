import { STATUSES, type Status } from './queries';

export type EnquiryDetail = {
  id: number;
  reference_code: string;
  customer_name: string | null;
  contact_number_e164: string | null;
  contact_channel: string | null;
  category_name: string | null;
  service_description: string | null;
  area_name: string | null;
  area_text: string | null;
  preferred_datetime_text: string | null;
  notes: string | null;
  preferred_tailor_id: number | null;
  preferred_tailor_name: string | null;
  consent_text_version: string;
  consent_at: string;
  status: Status;
  status_changed_at: string;
  is_spam: number;
  source: string | null;
  anonymised_at: string | null;
  created_at: string;
};

export const getEnquiry = (db: D1Database, id: number) =>
  db
    .prepare(
      `SELECT e.id, e.reference_code, e.customer_name, e.contact_number_e164, e.contact_channel, c.name AS category_name, e.service_description,
              a.name AS area_name, e.area_text, e.preferred_datetime_text, e.notes, e.preferred_tailor_id, t.display_name AS preferred_tailor_name, e.consent_text_version,
              e.consent_at, e.status, e.status_changed_at, e.is_spam, e.source, e.anonymised_at, e.created_at
       FROM enquiry e
       LEFT JOIN garment_category c ON c.id = e.garment_category_id
       LEFT JOIN service_area a ON a.id = e.area_id
       LEFT JOIN tailor t ON t.id = e.preferred_tailor_id
       WHERE e.id = ?`,
    )
    .bind(id)
    .first<EnquiryDetail>();

export type LogRow = {
  from_status: Status | null;
  to_status: Status;
  changed_at: string;
  email: string | null;
};
export const listLog = async (db: D1Database, id: number) =>
  (
    await db
      .prepare(
        `SELECT l.from_status, l.to_status, l.changed_at, u.email FROM enquiry_status_log l
         LEFT JOIN admin_user u ON u.id = l.changed_by WHERE l.enquiry_id = ? ORDER BY l.changed_at, l.id`,
      )
      .bind(id)
      .all<LogRow>()
  ).results;

export type NoteRow = { body: string; created_at: string; email: string };
export const listNotes = async (db: D1Database, id: number) =>
  (
    await db
      .prepare(
        `SELECT n.body, n.created_at, u.email FROM internal_note n JOIN admin_user u ON u.id = n.author_id
         WHERE n.enquiry_id = ? ORDER BY n.created_at, n.id`,
      )
      .bind(id)
      .all<NoteRow>()
  ).results;

/**
 * Any status at any time (no enforced order, no automation). The status, the log row and the audit row (ids only) are written
 * in one batch, so a change is never recorded half-way (FR-ADM-07, AC-11).
 */
export async function setStatus(
  db: D1Database,
  args: { id: number; status: Status; userId: number; now?: Date },
): Promise<'ok' | 'invalid' | 'not_found' | 'unchanged'> {
  const { id, status, userId } = args;
  if (!STATUSES.includes(status)) return 'invalid';
  const current = await db
    .prepare('SELECT status FROM enquiry WHERE id = ?')
    .bind(id)
    .first<{ status: string }>();
  if (!current) return 'not_found';
  if (current.status === status) return 'unchanged';
  const at = (args.now ?? new Date()).toISOString();
  // The old status is read inside the batch and every statement repeats `status != new`, so two changes at once cannot log a wrong from_status.
  await db.batch([
    db
      .prepare(
        'INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status, changed_by, changed_at) SELECT id, status, ?, ?, ? FROM enquiry WHERE id = ? AND status != ?',
      )
      .bind(status, userId, at, id, status),
    db
      .prepare(
        'UPDATE enquiry SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ? AND status != ?',
      )
      .bind(status, at, at, id, status),
    db
      .prepare(
        "INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT ?, 'enquiry_status_changed', 'enquiry', id FROM enquiry WHERE id = ? AND status = ? AND status_changed_at = ?",
      )
      .bind(userId, id, status, at),
  ]);
  return 'ok';
}

/** Manual spam flag; the inbox hides flagged enquiries by default. */
export async function setSpam(
  db: D1Database,
  args: { id: number; spam: boolean; userId: number },
): Promise<'ok' | 'not_found'> {
  const [update] = await db.batch([
    db
      .prepare('UPDATE enquiry SET is_spam = ?, updated_at = ? WHERE id = ?')
      .bind(args.spam ? 1 : 0, new Date().toISOString(), args.id),
    db
      .prepare(
        "INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT ?, 'enquiry_spam_changed', 'enquiry', id FROM enquiry WHERE id = ?",
      )
      .bind(args.userId, args.id),
  ]);
  return update.meta.changes === 0 ? 'not_found' : 'ok';
}

/** Internal notes are never public (FR-ADM-08). */
export async function addEnquiryNote(
  db: D1Database,
  args: { id: number; body: string; userId: number },
): Promise<'ok' | 'invalid' | 'not_found'> {
  const body = args.body.trim();
  if (!body || body.length > 2000) return 'invalid';
  const result = await db
    .prepare(
      'INSERT INTO internal_note (body, author_id, enquiry_id) SELECT ?, ?, id FROM enquiry WHERE id = ?',
    )
    .bind(body, args.userId, args.id)
    .run();
  return result.meta.changes === 0 ? 'not_found' : 'ok';
}
