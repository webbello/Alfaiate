export type InterestRow = {
  id: number;
  reference_code: string;
  contact_name: string | null;
  business_name: string | null;
  phone_e164: string | null;
  area_text: string | null;
  craft_text: string | null;
  message: string | null;
  consent_text_version: string;
  anonymised_at: string | null;
  created_at: string;
  decision: 'pending' | 'approved' | 'declined';
  tailor_id: number | null;
};
export const LIST_CAP = 200;

/** Newest first, capped. Admin-only: these are people's contact details. */
export async function listInterest(db: D1Database): Promise<InterestRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, reference_code, contact_name, business_name, phone_e164, area_text, craft_text, message, consent_text_version, anonymised_at, created_at, decision, tailor_id FROM tailor_interest ORDER BY created_at DESC, id DESC LIMIT ${LIST_CAP}`,
    )
    .all<InterestRow>();
  return results;
}
