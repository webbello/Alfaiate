import { normalisePhone } from '../contact-links/phone';

// Fields of the tailor interest form (FR-JOIN-01): nothing else is read from the submission.
export type Field =
  'name' | 'business' | 'phone' | 'area' | 'craft' | 'message' | 'consent';
export type ErrorKey = 'required' | 'invalid' | 'too_long';
export type FieldErrors = Partial<Record<Field, ErrorKey>>;
/** What was typed, shown again after an error. The consent tick is deliberately not kept. */
export type FormValues = Record<Exclude<Field, 'consent'>, string>;
export type InterestInput = {
  name: string;
  business: string | null;
  phone: string;
  area: string | null;
  craft: string | null;
  message: string | null;
};
export type Parsed =
  | { ok: true; data: InterestInput }
  | { ok: false; errors: FieldErrors; values: FormValues };

const LIMITS = {
  name: 100,
  business: 100,
  area: 100,
  craft: 200,
  message: 500,
} as const;

export function parseJoinForm(form: URLSearchParams): Parsed {
  const get = (key: string) => (form.get(key) ?? '').trim();
  const values: FormValues = {
    name: get('name'),
    business: get('business'),
    phone: get('phone'),
    area: get('area'),
    craft: get('craft'),
    message: get('message'),
  };
  const errors: FieldErrors = {};
  if (!values.name) errors.name = 'required';
  else if (values.name.length > LIMITS.name) errors.name = 'too_long';
  const phone = values.phone ? normalisePhone(values.phone) : null;
  if (!values.phone) errors.phone = 'required';
  else if (!phone) errors.phone = 'invalid';
  for (const key of ['business', 'area', 'craft', 'message'] as const)
    if (values[key].length > LIMITS[key]) errors[key] = 'too_long';
  if (form.get('consent') !== 'yes') errors.consent = 'required';
  if (Object.keys(errors).length > 0) return { ok: false, errors, values };
  return {
    ok: true,
    data: {
      name: values.name,
      business: values.business || null,
      phone: phone!,
      area: values.area || null,
      craft: values.craft || null,
      message: values.message || null,
    },
  };
}
