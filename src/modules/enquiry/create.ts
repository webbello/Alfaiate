import { newReference } from './reference';
import type { EnquiryInput, Resolved } from './schema';

const MAX_TRIES = 5;

/**
 * Stores one `new` enquiry and its first status-log row in a single batch (all or nothing), with the consent text version and time (PRV-03).
 * A reference collision is retried with a fresh code; any other failure returns `{ ok: false }` so the caller never shows a false success.
 */
export async function createEnquiry(
  db: D1Database,
  args: {
    input: EnquiryInput;
    choices: Resolved & { ok: true };
    consentVersion: string;
    now?: Date;
    generate?: () => string;
  },
): Promise<{ ok: true; reference: string } | { ok: false }> {
  const {
    input,
    choices,
    consentVersion,
    now = new Date(),
    generate = newReference,
  } = args;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const reference = generate();
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, garment_category_id, service_description,
               area_id, area_text, preferred_datetime_text, notes, preferred_tailor_id, consent_shared_with_tailor, consent_text_version, consent_at, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          )
          .bind(
            reference,
            input.name,
            input.phone,
            input.channel,
            choices.categoryId,
            input.service,
            choices.areaId,
            input.areaText,
            input.when,
            input.notes,
            choices.tailorId,
            consentVersion,
            now.toISOString(),
            choices.source,
          ),
        db
          .prepare(
            "INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status) SELECT id, NULL, 'new' FROM enquiry WHERE reference_code = ?",
          )
          .bind(reference),
        // business details live in their own table (one row, only for business enquiries)
        ...(input.organisation
          ? [
              db
                .prepare(
                  'INSERT INTO enquiry_business (enquiry_id, organisation_name, group_size_text) SELECT id, ?, ? FROM enquiry WHERE reference_code = ?',
                )
                .bind(input.organisation, input.groupSize ?? null, reference),
            ]
          : []),
      ]);
      return { ok: true, reference };
    } catch (error) {
      if (!String(error).includes('enquiry.reference_code'))
        return { ok: false };
    }
  }
  return { ok: false };
}
