import { REFERENCE_ALPHABET } from '../enquiry/reference';
import type { InterestInput } from './schema';

const MAX_TRIES = 5;
/** Random and non-sequential like the enquiry code, but prefixed JN so the two can never be confused. */
export function newJoinReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `JN-${[...bytes].map((b) => REFERENCE_ALPHABET[b & 31]).join('')}`;
}

/** Stores one interest record with the consent wording version and time. Creates nothing else: no tailor, no account, nothing public. */
export async function createInterest(
  db: D1Database,
  args: {
    input: InterestInput;
    consentVersion: string;
    now?: Date;
    generate?: () => string;
  },
): Promise<{ ok: true; reference: string } | { ok: false }> {
  const {
    input,
    consentVersion,
    now = new Date(),
    generate = newJoinReference,
  } = args;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const reference = generate();
    try {
      await db
        .prepare(
          'INSERT INTO tailor_interest (reference_code, contact_name, business_name, phone_e164, area_text, craft_text, message, consent_contact, consent_text_version, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
        )
        .bind(
          reference,
          input.name,
          input.business,
          input.phone,
          input.area,
          input.craft,
          input.message,
          consentVersion,
          now.toISOString(),
        )
        .run();
      return { ok: true, reference };
    } catch (error) {
      if (!String(error).includes('tailor_interest.reference_code'))
        return { ok: false };
    }
  }
  return { ok: false };
}
