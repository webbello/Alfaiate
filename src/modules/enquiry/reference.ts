/** 32 characters (no 0/O/1/I), so one random byte maps evenly with `& 31`. */
export const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The code a customer sees (FR-ENQ-04): random, non-sequential, nothing personal (BR-07). */
export function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `AT-${[...bytes].map((b) => REFERENCE_ALPHABET[b & 31]).join('')}`;
}
