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
};
const CHANNELS = ['whatsapp', 'phone', 'either'] as const;
const ID = /^[0-9]{1,9}$/;

/** The `?tailor=` / hidden `tailor` value: a plain slug or nothing. */
export const tailorParam = (value: string | null): string | null => {
  const slug = (value ?? '').trim();
  return slug.length <= 60 && SLUG.test(slug) ? slug : null;
};

export function parseEnquiryForm(form: URLSearchParams): Parsed {
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
  };
  const errors: FieldErrors = {};

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
      tailorSlug: tailorParam(form.get('tailor')),
    },
  };
}

export type Resolved =
  | {
      ok: true;
      categoryId: number | null;
      areaId: number | null;
      tailorId: number | null;
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

  const tailor = input.tailorSlug
    ? await db
        .prepare('SELECT id FROM tailor WHERE slug = ? AND is_published = 1')
        .bind(input.tailorSlug)
        .first<{ id: number }>()
    : null;
  return {
    ok: true,
    categoryId: input.categoryId,
    areaId: input.areaId,
    tailorId: tailor?.id ?? null,
    source: tailor ? `profile:${input.tailorSlug}` : 'form',
  };
}
