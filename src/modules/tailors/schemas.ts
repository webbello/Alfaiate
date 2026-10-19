import { z } from 'zod';
import { normalisePhone } from '../contact-links/phone';

// Form fields arrive as strings; a blank field means "no value".
const blank = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;
const text = (max: number) =>
  z.preprocess(blank, z.string().trim().max(max).nullable().optional());

const phone = z
  .preprocess(blank, z.string().nullable().optional())
  .transform((value, ctx) => {
    if (value == null) return null;
    const normalised = normalisePhone(value);
    if (!normalised) {
      ctx.addIssue({
        code: 'custom',
        message: 'Not a Timor-Leste phone number',
      });
      return z.NEVER;
    }
    return normalised;
  });

/** True for a real calendar date; `new Date` throws RangeError on out-of-range months, so check first. */
function isRealDate(d: string): boolean {
  const time = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(d);
}

const date = z.preprocess(
  blank,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealDate, 'Not a real date')
    .nullable()
    .optional(),
);

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Only these fields can be changed through the profile form. Publishing, permission, verification and fee fields have their own, separately guarded paths. */
export const profileFields = z.object({
  display_name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(60).regex(SLUG),
  description: text(2000),
  shop_address_text: text(300),
  home_visits: z.enum(['yes', 'no', 'unknown']),
  languages: text(200),
  price_note: text(200),
  price_confirmed_on: date,
  whatsapp: phone,
  phone,
  private_contact_name: text(120),
  private_phone: phone,
});

export const createSchema = profileFields
  .omit({ slug: true, home_visits: true })
  .extend({ home_visits: profileFields.shape.home_visits.default('unknown') });
export const updateSchema = profileFields.partial();

export type ProfileInput = z.input<typeof updateSchema>;

/** The names of the fields that failed, for field-level messages (the form maps them to labels). */
export function failedFields(error: z.ZodError): string[] {
  return [
    ...new Set(error.issues.map((issue) => String(issue.path[0] ?? 'form'))),
  ];
}
