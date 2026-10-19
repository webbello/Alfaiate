import type { AreaEntry, CategoryEntry } from './links';
import type { ProfileInput } from './schemas';

const text = (form: FormData, name: string) => form.get(name)?.toString() ?? '';

/** Only these form fields reach the repository, so a forged field cannot set status, publishing, verification or fees. */
export function profileFromForm(form: FormData): ProfileInput {
  const input: ProfileInput = {
    display_name: text(form, 'display_name'),
    description: text(form, 'description'),
    shop_address_text: text(form, 'shop_address_text'),
    home_visits: (text(form, 'home_visits') ||
      undefined) as ProfileInput['home_visits'],
    languages: text(form, 'languages'),
    price_note: text(form, 'price_note'),
    price_confirmed_on: text(form, 'price_confirmed_on'),
    whatsapp: text(form, 'whatsapp'),
    phone: text(form, 'phone'),
    private_contact_name: text(form, 'private_contact_name'),
    private_phone: text(form, 'private_phone'),
  };
  if (text(form, 'slug')) input.slug = text(form, 'slug');
  return input;
}

export function categoriesFromForm(
  form: FormData,
  categoryIds: number[],
): CategoryEntry[] {
  return categoryIds
    .filter((id) => form.get(`cat_${id}`) === 'on')
    .map((id) => {
      const source = text(form, `source_${id}`);
      return {
        category_id: id,
        price_from: text(form, `from_${id}`),
        price_to: text(form, `to_${id}`),
        price_unit_note: text(form, `unit_${id}`),
        price_confirmed_on: text(form, `confirmed_${id}`),
        price_source:
          source === 'verified' || source === 'tailor_supplied'
            ? source
            : undefined,
      };
    });
}

export function areasFromForm(form: FormData, areaIds: number[]): AreaEntry[] {
  return areaIds.flatMap((id) => [
    ...(form.get(`shop_${id}`) === 'on'
      ? [{ area_id: id, kind: 'shop_location' as const }]
      : []),
    ...(form.get(`serves_${id}`) === 'on'
      ? [{ area_id: id, kind: 'serves' as const }]
      : []),
  ]);
}
