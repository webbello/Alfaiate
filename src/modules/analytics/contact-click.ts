import { SLUG } from '../tailors/schemas';
import { hit, ipBucket } from '../auth/rate-limit';

/** One address may register this many taps per hour; beyond that taps are ignored (inflation guard, not a security boundary). */
export const CLICK_LIMIT = 60;
const WINDOW_SECONDS = 60 * 60;

export type ClickResult = 'recorded' | 'invalid' | 'not_found' | 'limited';

/**
 * Counts one WhatsApp or Call tap for a published tailor (ANA-02). Stores only tailor, channel, UTC day and a count: no visitor
 * identity, no cookie. The address is used for the hourly limit only, as a hash inside the shared rate-limit table.
 * These are intent signals, not confirmed contacts (M6).
 */
export async function recordContactClick(
  db: D1Database,
  input: { slug: string; channel: string },
  address: string | undefined,
  now = new Date(),
): Promise<ClickResult> {
  const { slug, channel } = input;
  if (channel !== 'whatsapp' && channel !== 'phone') return 'invalid';
  if (typeof slug !== 'string' || slug.length > 60 || !SLUG.test(slug))
    return 'invalid';

  if (
    (await hit(
      db,
      `contact-click:${address ? ipBucket(address) : 'unknown'}`,
      WINDOW_SECONDS,
      now,
    )) > CLICK_LIMIT
  )
    return 'limited';

  const tailor = await db
    .prepare(
      `SELECT id FROM tailor WHERE slug = ? AND is_published = 1 AND permission_recorded = 1 AND contact_publish_consent = 1
       AND (CASE ? WHEN 'whatsapp' THEN whatsapp_e164 ELSE phone_e164 END) IS NOT NULL`,
    )
    .bind(slug, channel)
    .first<{ id: number }>();
  if (!tailor) return 'not_found';

  await db
    .prepare(
      `INSERT INTO contact_click_daily (tailor_id, channel, date, count) VALUES (?, ?, ?, 1)
       ON CONFLICT (tailor_id, channel, date) DO UPDATE SET count = count + 1`,
    )
    .bind(tailor.id, channel, now.toISOString().slice(0, 10))
    .run();
  return 'recorded';
}
