import { hit } from '../auth/rate-limit';
import { listImages, type ImageRow } from '../media/list';
import { VARIANTS, type Variant } from '../media/keys';
import { removePhoto, updateDetails, type Result } from '../media/service';
import {
  storeImage,
  type MediaBindings,
  type StoreResult,
} from '../media/store';
import { getTailor } from '../tailors/repo';
import { tailorMayEdit } from './profile';
import type { TailorSession } from './session';

export const UPLOADS_PER_HOUR = 20;

export const portalImages = (
  db: D1Database,
  session: TailorSession,
): Promise<ImageRow[]> => listImages(db, session.tailorId);

async function gate(b: MediaBindings, session: TailorSession) {
  const tailor = await getTailor(b.DB, session.tailorId);
  return tailor && tailorMayEdit(tailor.status) ? tailor : null;
}

/**
 * A tailor's own photo (FR-TPO-05): stored privately like every photo, with the tailor's confirmation that it may be shown recorded today,
 * but HIDDEN until an admin shows it, so nothing a tailor uploads can reach the public bucket without the owner.
 */
export async function uploadPortalPhoto(
  b: MediaBindings,
  session: TailorSession,
  input: {
    alt_text: string;
    caption?: string;
    confirmed: boolean;
    variants: Record<Variant, Uint8Array>;
  },
  now = new Date(),
): Promise<
  StoreResult | { ok: false; error: 'locked' | 'not_confirmed' | 'limited' }
> {
  if (!input.confirmed) return { ok: false, error: 'not_confirmed' };
  const tailor = await gate(b, session);
  if (!tailor) return { ok: false, error: 'locked' };
  if (
    (await hit(b.DB, `portal:upload:${session.tailorId}`, 3600, now)) >
    UPLOADS_PER_HOUR
  )
    return { ok: false, error: 'limited' };
  const stored = await storeImage(
    b,
    { tailorAccountId: session.accountId },
    session.tailorId,
    {
      ...input,
      // A tailor who writes nothing gets a plain description, so no photo is stored without alt text.
      alt_text:
        input.alt_text.trim() ||
        `Clothes made by ${tailor.display_name}`.slice(0, 200),
      // Hidden and with the tailor's confirmation from the very first insert: no moment where the row is visible.
      initial: {
        visible: false,
        permissionDate: now.toISOString().slice(0, 10),
      },
    },
  );
  return stored;
}

export async function updatePortalPhoto(
  b: MediaBindings,
  session: TailorSession,
  imageId: number,
  input: { alt_text: string; caption?: string },
): Promise<Result> {
  if (!(await gate(b, session))) return { ok: false, error: 'locked' };
  return updateDetails(
    b,
    { tailorAccountId: session.accountId },
    'manager',
    session.tailorId,
    imageId,
    input,
  );
}

export async function deletePortalPhoto(
  b: MediaBindings,
  session: TailorSession,
  imageId: number,
): Promise<Result> {
  if (!(await gate(b, session))) return { ok: false, error: 'locked' };
  return removePhoto(
    b,
    { tailorAccountId: session.accountId },
    'manager',
    session.tailorId,
    imageId,
  );
}

export { VARIANTS };
