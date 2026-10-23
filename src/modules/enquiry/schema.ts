import { normalisePhone } from '../contact-links/phone';
import { SLUG } from '../tailors/schemas';

// Form fields of the request (FR-ENQ-01, PRV-01): nothing else is read from the submission.
export type Field =
  | 'name'
  | 'phone'
  | 'channel'
  | 'category'
  | 'service'
  | 'area'
  | 'area_text'
  | 'when'
  | 'notes'
  | 'organisation'
  | 'group_size'
  | 'consent';
export type ErrorKey = 'required' | 'invalid' | 'too_long';
export type FieldErrors = Partial<Record<Field, ErrorKey>>;
/** What the customer typed, shown again after an error. The consent tick is deliberately not kept: it must be given again. */
export type FormValues = Record<Exclude<Field, 'consent'>, string>;

export type EnquiryInput = {
  name: string;
  phone: string;
  channel: 'whatsapp' | 'phone' | 'either';
  categoryId: number | null;
  service: string | null;
  areaId: number | null;
  areaText: string | null;
  when: string | null;
  notes: string | null;
  tailorSlug: string | null;
  /** Up to two more tailors from the request list; they are named in the notes, only the first is the preferred tailor. */
  alsoSlugs?: string[];
  /** Set only on the business form (FR-ENQ-09). */
  organisation?: string | null;
  groupSize?: string | null;
  business?: boolean;
};
export type Parsed =
  | { ok: true; data: EnquiryInput }
  | { ok: false; errors: FieldErrors; values: FormValues };

const LIMITS = {
  name: 100,
  service: 200,
  area_text: 100,
  when: 100,
  notes: 1000,
  organisation: 100,
  group_size: 40,
};
const CHANNELS = ['whatsapp', 'phone', 'either'] as const;
const ID = /^[0-9]{1,9}$/;

export const MAX_TAILORS = 3;
/** Every `tailor` value of a request-list link: valid slugs only, no repeats, at most MAX_TAILORS. */
export const tailorParams = (values: string[]): string[] =>
  [
    ...new Set(values.map(tailorParam).filter((s): s is string => s !== null)),
  ].slice(0, MAX_TAILORS);

/** The `?tailor=` / hidden `tailor` value: a plain slug or nothing. */
export const tailorParam = (value: string | null): string | null => {
  const slug = (value ?? '').trim();
  return slug.length <= 60 && SLUG.test(slug) ? slug : null;
};

export function parseEnquiryForm(
  form: URLSearchParams,
  options: { business?: boolean } = {},
): Parsed {
  const business = options.business === true;
  const get = (key: string) => (form.get(key) ?? '').trim();
  const values: FormValues = {
    name: get('name'),
    phone: get('phone'),
    channel: get('channel'),
    category: get('category'),
    service: get('service'),
    area: get('area'),
    area_text: get('area_text'),
    when: get('when'),
    notes: get('notes'),
    organisation: business ? get('organisation') : '',
    group_size: business ? get('group_size') : '',
  };
  const errors: FieldErrors = {};
  if (business) {
    if (!values.organisation) errors.organisation = 'required';
    else if (values.organisation.length > LIMITS.organisation)
      errors.organisation = 'too_long';
    if (values.group_size.length > LIMITS.group_size)
      errors.group_size = 'too_long';
  }

  if (!values.name) errors.name = 'required';
  else if (values.name.length > LIMITS.name) errors.name = 'too_long';

  const phone = values.phone ? normalisePhone(values.phone) : null;
  if (!values.phone) errors.phone = 'required';
  else if (!phone) errors.phone = 'invalid';

  const channel = CHANNELS.find((c) => c === values.channel);
  if (!values.channel) errors.channel = 'required';
  else if (!channel) errors.channel = 'invalid';

  if (form.get('consent') !== 'yes') errors.consent = 'required';

  let categoryId: number | null = null;
  if (values.category) {
    if (ID.test(values.category)) categoryId = Number(values.category);
    else errors.category = 'invalid';
  }

  let areaId: number | null = null;
  let areaText: string | null = null;
  if (values.area === 'other') {
    if (values.area_text.length > LIMITS.area_text)
      errors.area_text = 'too_long';
    areaText = values.area_text || null;
  } else if (values.area) {
    if (ID.test(values.area)) areaId = Number(values.area);
    else errors.area = 'invalid';
  }

  for (const key of ['service', 'when', 'notes'] as const)
    if (values[key].length > LIMITS[key]) errors[key] = 'too_long';

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };
  return {
    ok: true,
    data: {
      name: values.name,
      phone: phone as string,
      channel: channel as EnquiryInput['channel'],
      categoryId,
      service: values.service || null,
      areaId,
      areaText,
      when: values.when || null,
      notes: values.notes || null,
      tailorSlug: tailorParams(form.getAll('tailor'))[0] ?? null,
      alsoSlugs: tailorParams(form.getAll('tailor')).slice(1),
      organisation: business ? values.organisation : null,
      groupSize: business ? values.group_size || null : null,
      business,
    },
  };
}

export type Resolved =
  | {
      ok: true;
      categoryId: number | null;
      areaId: number | null;
      tailorId: number | null;
      /** Names of the other tailors the visitor asked about (published ones only). */
      alsoNames: string[];
      source: string;
    }
  | { ok: false; errors: FieldErrors };

/** Checks the chosen category and area are active, and turns `?tailor=` into an id only for a published tailor (otherwise it is ignored). */
export async function resolveChoices(
  db: D1Database,
  input: EnquiryInput,
): Promise<Resolved> {
  const errors: FieldErrors = {};
  const active = async (
    table: 'garment_category' | 'service_area',
    id: number | null,
  ) =>
    id === null ||
    (await db
      .prepare(`SELECT 1 AS ok FROM ${table} WHERE id = ? AND is_active = 1`)
      .bind(id)
      .first()) !== null;
  if (!(await active('garment_category', input.categoryId)))
    errors.category = 'invalid';
  if (!(await active('service_area', input.areaId))) errors.area = 'invalid';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const find = (slug: string) =>
    db
      .prepare(
        'SELECT id, display_name AS name FROM tailor WHERE slug = ? AND is_published = 1 AND permission_recorded = 1',
      )
      .bind(slug)
      .first<{ id: number; name: string }>();
  // The first published tailor on the list is the preferred one; the rest are only named in the notes.
  let tailor: { id: number; name: string; slug: string } | null = null;
  const alsoNames: string[] = [];
  for (const slug of [input.tailorSlug, ...(input.alsoSlugs ?? [])]) {
    if (!slug) continue;
    const found = await find(slug);
    if (!found) continue;
    if (tailor) alsoNames.push(found.name);
    else tailor = { ...found, slug };
  }
  return {
    ok: true,
    categoryId: input.categoryId,
    areaId: input.areaId,
    tailorId: tailor?.id ?? null,
    alsoNames,
    source: input.business
      ? 'business'
      : tailor
        ? `profile:${tailor.slug}`
        : 'form',
  };
}
