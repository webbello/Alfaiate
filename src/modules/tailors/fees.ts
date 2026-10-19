import { z } from 'zod';
import { audit } from '../auth/audit';
import { can } from '../auth/permissions';
import { isRealDate } from './schemas';

const terms = z.object({
  text: z.string().trim().max(2000),
  agreed_on: z
    .string()
    .refine(
      (d) => d === '' || (/^\d{4}-\d{2}-\d{2}$/.test(d) && isRealDate(d)),
    ),
});

/** Agreed referral-fee terms (FR-REF-08, BR-09). Owner only (`fee.view`); the text never goes into the audit log. */
export async function setFeeTerms(
  db: D1Database,
  actorId: number,
  role: string,
  tailorId: number,
  input: { text: string; agreed_on: string },
): Promise<
  { ok: true } | { ok: false; error: 'forbidden' | 'invalid' | 'not_found' }
> {
  if (!can(role, 'fee.view')) return { ok: false, error: 'forbidden' };
  const parsed = terms.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const result = await db
    .prepare(
      `UPDATE tailor SET fee_terms_text = ?, fee_terms_agreed_on = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    )
    .bind(parsed.data.text || null, parsed.data.agreed_on || null, tailorId)
    .run();
  if (result.meta.changes === 0) return { ok: false, error: 'not_found' };
  await audit(db, {
    userId: actorId,
    action: 'fee_terms_changed',
    entityType: 'tailor',
    entityId: tailorId,
  });
  return { ok: true };
}
