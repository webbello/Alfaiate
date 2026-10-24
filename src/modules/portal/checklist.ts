import { audit } from '../auth/audit';
import { notifyNewEnquiry, type Notifier } from '../notify';
import { getTailor } from '../tailors/repo';
import { tailorMayEdit } from './profile';
import type { TailorSession } from './session';

export type PortalItem = {
  key: 'contact' | 'about' | 'work' | 'areas' | 'photos';
  done: boolean;
  required: boolean;
  label: string;
  /** Short name for the step bar. */
  short: string;
  /** Why it matters, in the tailor's words, and roughly how long it takes. */
  reason: string;
  minutes: number;
  href: string;
};

/** What the tailor still has to fill in, in the order a tailor thinks in (FR-TPO-06). Required items gate "Ready for review"; photos are recommended. */
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
      key: 'contact',
      done: !!r.contact,
      required: true,
      label: 'Add a WhatsApp or phone number',
      short: 'Contact',
      reason: 'So customers can reach you.',
      minutes: 1,
      href: '/portal/profile?step=contact',
    },
    {
      key: 'about',
      done: !!r.about,
      required: true,
      label: 'Tell customers about your work',
      short: 'About you',
      reason: 'Customers read this first.',
      minutes: 2,
      href: '/portal/profile?step=about',
    },
    {
      key: 'work',
      done: r.work > 0,
      required: true,
      label: 'Choose the types of clothing you make',
      short: 'What you make',
      reason: 'So the right customers find you.',
      minutes: 1,
      href: '/portal/work?step=types',
    },
    {
      key: 'areas',
      done: r.areas > 0,
      required: true,
      label: 'Choose where you work',
      short: 'Where you work',
      reason: 'Customers look for a tailor near them.',
      minutes: 1,
      href: '/portal/work?step=areas',
    },
    {
      key: 'photos',
      done: r.photos > 0,
      required: false,
      label: 'Add photos of your work (recommended)',
      short: 'Photos',
      reason: 'Photos get the most attention.',
      minutes: 2,
      href: '/portal/photos',
    },
  ];
}

/** Where "Save and next" goes: the next step not done yet after this one, then any earlier one, else the overview. */
export function nextStepHref(items: PortalItem[], current: PortalItem['key']) {
  const at = items.findIndex((i) => i.key === current);
  const later = items.slice(at + 1).find((i) => !i.done);
  const earlier = items.slice(0, at).find((i) => !i.done);
  return (later ?? earlier)?.href ?? '/portal';
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

/** The line shown after a step is saved: how far the tailor has got, and when the page can be sent. */
export function progressMessage(items: PortalItem[]) {
  const done = items.filter((i) => i.done).length;
  const ready = items.every((i) => !i.required || i.done);
  return `${done} of ${items.length} steps done.${ready ? ' Your page is ready to send.' : ''}`;
}

/** `href` plus the flag that makes the next page say "saved". */
export const savedHref = (href: string) =>
  `${href}${href.includes('?') ? '&' : '?'}saved=1`;
