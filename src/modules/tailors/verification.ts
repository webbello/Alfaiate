/** Public facts the owner can verify (BR-11). Prices carry their own per-category source; photos are governed by permission. */
export const VERIFIABLE_FIELDS = [
  'description',
  'shop_address_text',
  'home_visits',
  'languages',
  'price_note',
  'whatsapp',
  'phone',
] as const;
export type VerifiableField = (typeof VERIFIABLE_FIELDS)[number];

export const isVerifiable = (field: string): field is VerifiableField =>
  (VERIFIABLE_FIELDS as readonly string[]).includes(field);
