import { audit } from '../auth/audit';
import { notifyNewEnquiry, type Notifier } from '../notify';
import { getTailor } from '../tailors/repo';
import { tailorMayEdit } from './profile';
import type { TailorSession } from './session';

export type PortalItem = {
  key: 'about' | 'work' | 'areas' | 'contact' | 'photos';
  done: boolean;
  required: boolean;
  label: string;
  href: string;
};

/** What the tailor still has to fill in, in their own words (FR-TPO-06). Required items gate "Ready for review"; photos are recommended. */
export async function portalChecklist(
  db: D1Database,
  tailorId: number,
): Promise<PortalItem[]> {
  const row = await db
    .prepare(
      `SELECT (description IS NOT NULL AND trim(description) <> '') AS about, (whatsapp_e164 IS NOT NULL OR phone_e164 IS NOT NULL) AS contact,
        (SELECT count(*) FROM tailor_category WHERE tailor_id = t.id) AS work, (SELECT count(*) FROM tailor_area WHERE tailor_id = t.id) AS areas,
        (SELECT count(*) FROM portfolio_image WHERE tailor_id = t.id) AS photos
       FROM tailor t WHERE id = ?`,
    )
    .bind(tailorId)
    .first<{
      about: number;
      contact: number;
      work: number;
      areas: number;
      photos: number;
    }>();
  const r = row ?? { about: 0, contact: 0, work: 0, areas: 0, photos: 0 };
  return [
    {
      key: 'about',
      done: !!r.about,
      required: true,
      label: 'Tell customers about your work',
      href: '/portal/profile',
    },
    {
      key: 'work',
      done: r.work > 0,
      required: true,
      label: 'Choose the types of clothing you make',
      href: '/portal/work',
    },
    {
      key: 'areas',
      done: r.areas > 0,
      required: true,
      label: 'Choose where you work',
      href: '/portal/work',
    },
    {
      key: 'contact',
      done: !!r.contact,
      required: true,
      label: 'Add a WhatsApp or phone number',
      href: '/portal/profile',
    },
    {
      key: 'photos',
      done: r.photos > 0,
      required: false,
      label: 'Add photos of your work (recommended)',
      href: '/portal/photos',
    },
  ];
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: 'locked' | 'incomplete' | 'no_consent' | 'not_found' };

/**
 * "Ready for review": records the request and tells the owner (reference and link only, SEC-05). It changes nothing about the tailor's page:
 * status and publishing stay with staff (FR-TPO-07).
 */
export async function submitForReview(
  db: D1Database,
  session: TailorSession,
  options: {
    siteUrl: string;
    notify?: Notifier;
    waitUntil?: (work: Promise<unknown>) => void;
  },
  now = new Date(),
): Promise<SubmitResult> {
  const tailor = await getTailor(db, session.tailorId);
  if (!tailor) return { ok: false, error: 'not_found' };
  if (!tailorMayEdit(tailor.status)) return { ok: false, error: 'locked' };
  const account = await db
    .prepare('SELECT consent_at FROM tailor_account WHERE id = ?')
    .bind(session.accountId)
    .first<{ consent_at: string | null }>();
  if (!account?.consent_at) return { ok: false, error: 'no_consent' };
  if (
    (await portalChecklist(db, session.tailorId)).some(
      (i) => i.required && !i.done,
    )
  )
    return { ok: false, error: 'incomplete' };
  await db
    .prepare('UPDATE tailor_account SET review_requested_at = ? WHERE id = ?')
    .bind(now.toISOString(), session.accountId)
    .run();
  await audit(db, {
    userId: null,
    tailorAccountId: session.accountId,
    action: 'portal_submitted',
    entityType: 'tailor',
    entityId: session.tailorId,
  });
  const notice = notifyNewEnquiry(
    {
      reference: `TP-${session.tailorId}`,
      adminUrl: `${options.siteUrl}/admin/tailors/${session.tailorId}`,
      kind: 'tailor-ready',
    },
    options.notify,
  );
  if (options.waitUntil) options.waitUntil(notice);
  else await notice;
  return { ok: true };
}
