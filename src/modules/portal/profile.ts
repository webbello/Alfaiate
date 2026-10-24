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
  // A step page posts only its own fields: a field that was not sent is left as it is, never blanked.
  const sent = <K extends keyof ProfileInput>(key: K) =>
    form.has(key) ? { [key]: full[key] } : {};
  return {
    ...sent('display_name'),
    ...sent('description'),
    ...sent('shop_address_text'),
    ...sent('home_visits'),
    ...sent('languages'),
    ...sent('price_note'),
    ...(published ? {} : { ...sent('whatsapp'), ...sent('phone') }),
  };
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
  const input = portalProfileInput(form, tailor.is_published === 1);
  if (Object.keys(input).length === 0) return { ok: true }; // nothing sent (for example the numbers of a published page): nothing to write
  return updateProfile(
    db,
    { tailorAccountId: session.accountId },
    'manager',
    session.tailorId,
    input,
  );
}
