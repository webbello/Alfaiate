import { getTailor, updateProfile, type UpdateResult } from '../tailors/repo';
import { profileFromForm } from '../tailors/form';
import type { ProfileInput } from '../tailors/schemas';
import type { TailorSession } from './session';

/**
 * What a tailor may change (FR-TPO-04): their own words and, until the page is published, their public numbers.
 * Everything else (slug, status, publishing, permission, verified facts, fees, private contact, price check date, tailor id) is left out
 * on purpose: a forged form field never reaches the repository.
 */
export function portalProfileInput(
  form: FormData,
  published: boolean,
): ProfileInput {
  const full = profileFromForm(form);
  const input: ProfileInput = {
    display_name: full.display_name,
    description: full.description,
    shop_address_text: full.shop_address_text,
    home_visits: full.home_visits,
    languages: full.languages,
    price_note: full.price_note,
  };
  if (!published) {
    input.whatsapp = full.whatsapp;
    input.phone = full.phone;
  }
  return input;
}

/** A suspended or archived page is the owner's to change. */
export const tailorMayEdit = (status: string) =>
  status === 'draft' || status === 'approved';

export async function savePortalProfile(
  db: D1Database,
  session: TailorSession,
  form: FormData,
): Promise<UpdateResult> {
  const tailor = await getTailor(db, session.tailorId);
  if (!tailor) return { ok: false, error: 'not_found' };
  if (!tailorMayEdit(tailor.status)) return { ok: false, error: 'locked' };
  // The role argument only passes the repository's lock check; what can change is decided by `portalProfileInput` above.
  return updateProfile(
    db,
    { tailorAccountId: session.accountId },
    'manager',
    session.tailorId,
    portalProfileInput(form, tailor.is_published === 1),
  );
}
