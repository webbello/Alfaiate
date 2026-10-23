import { z } from 'zod';
import { audit } from '../auth/audit';
import { can } from '../auth/permissions';
import { reconcileImages } from '../media/reconcile';
import type { MediaBindings } from '../media/store';
import { getTailor, type TailorRow } from './repo';
import { isRealDate } from './schemas';
import { isVerifiable, VERIFIABLE_FIELDS } from './verification';

export type PublishBlocker =
  | 'not_approved'
  | 'no_permission_recorded'
  | 'no_contact_number'
  | 'no_contact_consent';
type Failure =
  'forbidden' | 'not_found' | 'invalid' | 'invalid_state' | 'needs_contact';
export type Result =
  { ok: true } | { ok: false; error: Failure; fields?: string[] };
export type PublishResult =
  Result | { ok: false; error: 'blocked'; blockers: PublishBlocker[] };

/**
 * One source of truth for "may this tailor be public": the UI shows these reasons, the handler enforces them, the database backs them up (BR-05, BR-06, AC-10).
 * "No number" and "no consent to show it" are separate blockers on purpose: they are fixed in different places and used to read as one confusing message.
 */
export function publishBlockers(
  t: Pick<
    TailorRow,
    | 'status'
    | 'permission_recorded'
    | 'contact_publish_consent'
    | 'whatsapp_e164'
    | 'phone_e164'
  >,
): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (t.status !== 'approved') blockers.push('not_approved');
  if (!t.permission_recorded) blockers.push('no_permission_recorded');
  if (!t.whatsapp_e164 && !t.phone_e164) blockers.push('no_contact_number');
  if (!t.contact_publish_consent) blockers.push('no_contact_consent');
  return blockers;
}

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
const mayPublish = (role: string) => can(role, 'tailor.publish');

async function load(
  b: MediaBindings,
  role: string,
  id: number,
): Promise<
  | { ok: false; error: 'forbidden' | 'not_found' }
  | { ok: true; tailor: TailorRow }
> {
  if (!mayPublish(role)) return { ok: false, error: 'forbidden' };
  const tailor = await getTailor(b.DB, id);
  return tailor ? { ok: true, tailor } : { ok: false, error: 'not_found' };
}

export async function approveTailor(
  b: MediaBindings,
  actorId: number,
  role: string,
  id: number,
): Promise<Result> {
  const found = await load(b, role, id);
  if (!found.ok) return found;
  if (found.tailor.status !== 'draft' && found.tailor.status !== 'approved')
    return { ok: false, error: 'invalid_state' };
  await b.DB.prepare(
    `UPDATE tailor SET status = 'approved', updated_at = ${NOW} WHERE id = ?`,
  )
    .bind(id)
    .run();
  await audit(b.DB, {
    userId: actorId,
    action: 'tailor_updated',
    entityType: 'tailor',
    entityId: id,
  });
  return { ok: true };
}

const permission = z.object({
  note: z.string().trim().min(1).max(500),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealDate),
  contact_publish_consent: z.boolean(),
});

/** Zod field -> the form control it came from, so the page can mark exactly that control. */
const PERMISSION_FIELD: Record<string, string> = {
  note: 'permission_note',
  date: 'permission_date',
  contact_publish_consent: 'contact_publish_consent',
};

/** Records who, when and how the tailor gave permission (BR-06), and whether their contact numbers may be shown (PRV-06). */
export async function recordPermission(
  b: MediaBindings,
  actorId: number,
  role: string,
  id: number,
  input: { note: string; date: string; contact_publish_consent: boolean },
): Promise<Result> {
  const found = await load(b, role, id);
  if (!found.ok) return found;
  const parsed = permission.safeParse(input);
  if (!parsed.success) {
    const fields = [
      ...new Set(
        parsed.error.issues.map(
          (issue) => PERMISSION_FIELD[String(issue.path[0] ?? '')] ?? 'form',
        ),
      ),
    ];
    return { ok: false, error: 'invalid', fields };
  }
  if (found.tailor.is_published && !parsed.data.contact_publish_consent)
    return { ok: false, error: 'needs_contact' };
  await b.DB.prepare(
    `UPDATE tailor SET permission_recorded = 1, permission_note = ?, permission_date = ?, contact_publish_consent = ?, updated_at = ${NOW} WHERE id = ?`,
  )
    .bind(
      parsed.data.note,
      parsed.data.date,
      parsed.data.contact_publish_consent ? 1 : 0,
      id,
    )
    .run();
  await audit(b.DB, {
    userId: actorId,
    action: 'tailor_updated',
    entityType: 'tailor',
    entityId: id,
  });
  return { ok: true };
}

/** Withdrawing permission takes the tailor and all its images off the public site in one step. */
export async function withdrawPermission(
  b: MediaBindings,
  actorId: number,
  role: string,
  id: number,
): Promise<Result> {
  const found = await load(b, role, id);
  if (!found.ok) return found;
  await b.DB.batch([
    b.DB.prepare(
      `UPDATE tailor SET is_published = 0, updated_at = ${NOW} WHERE id = ?`,
    ).bind(id),
    b.DB.prepare(
      `UPDATE tailor SET permission_recorded = 0, contact_publish_consent = 0, updated_at = ${NOW} WHERE id = ?`,
    ).bind(id),
    // The tailor's permission covered their photos too (BR-06): each one must be granted again after a fresh permission.
    b.DB.prepare(
      `UPDATE portfolio_image SET permission_granted = 0, permission_date = NULL, updated_at = ${NOW} WHERE tailor_id = ?`,
    ).bind(id),
  ]);
  await audit(b.DB, {
    userId: actorId,
    action: found.tailor.is_published ? 'tailor_unpublished' : 'tailor_updated',
    entityType: 'tailor',
    entityId: id,
  });
  await reconcileImages(b, id);
  return { ok: true };
}

export async function publishTailor(
  b: MediaBindings,
  actorId: number,
  role: string,
  id: number,
): Promise<PublishResult> {
  const found = await load(b, role, id);
  if (!found.ok) return found;
  const blockers = publishBlockers(found.tailor);
  if (blockers.length > 0) return { ok: false, error: 'blocked', blockers };
  // The requirements are repeated in the WHERE clause, so a change made by another request since the check above
  // (consent withdrawn, numbers removed, status changed) makes this update do nothing instead of publishing.
  let changes: number;
  try {
    changes = (
      await b.DB.prepare(
        `UPDATE tailor SET is_published = 1, published_at = coalesce(published_at, ${NOW}), updated_at = ${NOW}
         WHERE id = ? AND status = 'approved' AND permission_recorded = 1 AND contact_publish_consent = 1
           AND (whatsapp_e164 IS NOT NULL OR phone_e164 IS NOT NULL)`,
      )
        .bind(id)
        .run()
    ).meta.changes;
  } catch {
    changes = 0; // the database CHECK is a further backstop
  }
  if (changes === 0) {
    const fresh = await getTailor(b.DB, id);
    return {
      ok: false,
      error: 'blocked',
      blockers: fresh ? publishBlockers(fresh) : publishBlockers(found.tailor),
    };
  }
  await audit(b.DB, {
    userId: actorId,
    action: 'tailor_published',
    entityType: 'tailor',
    entityId: id,
  });
  await reconcileImages(b, id);
  return { ok: true };
}

/** If syncing images fails after the flag is cleared, this throws and the caller retries; any later reconcile converges. */
export async function unpublishTailor(
  b: MediaBindings,
  actorId: number,
  role: string,
  id: number,
): Promise<Result> {
  const found = await load(b, role, id);
  if (!found.ok) return found;
  await b.DB.prepare(
    `UPDATE tailor SET is_published = 0, updated_at = ${NOW} WHERE id = ?`,
  )
    .bind(id)
    .run();
  await audit(b.DB, {
    userId: actorId,
    action: 'tailor_unpublished',
    entityType: 'tailor',
    entityId: id,
  });
  await reconcileImages(b, id);
  return { ok: true };
}

/** Which public facts the owner has verified (BR-11). Only known fields; there is no field for ratings, credentials or claims. */
export async function setVerifiedFields(
  b: MediaBindings,
  actorId: number,
  role: string,
  id: number,
  fields: string[],
): Promise<Result> {
  const found = await load(b, role, id);
  if (!found.ok) return found;
  if (!fields.every(isVerifiable)) return { ok: false, error: 'invalid' };
  const ordered = VERIFIABLE_FIELDS.filter((f) => fields.includes(f));
  await b.DB.prepare(
    `UPDATE tailor SET verified_fields = ?, updated_at = ${NOW} WHERE id = ?`,
  )
    .bind(JSON.stringify(ordered), id)
    .run();
  await audit(b.DB, {
    userId: actorId,
    action: 'tailor_updated',
    entityType: 'tailor',
    entityId: id,
  });
  return { ok: true };
}
