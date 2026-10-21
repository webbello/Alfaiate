import { z } from 'zod';
import { audit } from '../auth/audit';
import { MIN_PASSWORD_LENGTH } from '../auth/admin-users';
import { hashPassword } from '../auth/password';
import { hit } from '../auth/rate-limit';
import { en } from '../../i18n/en';
import { consumeInvite } from './invite';
import { createTailorSession } from './session';

const ACCEPT_LIMIT = 10;
const WINDOW_SECONDS = 15 * 60;

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(1024),
  consent: z.literal('yes'),
});

export type AcceptResult =
  | { ok: true; token: string; expiresAt: Date }
  | {
      ok: false;
      error:
        | 'invalid_link'
        | 'email'
        | 'password'
        | 'consent'
        | 'email_taken'
        | 'limited';
    };

/** Uses the invite: sets email and password, records the permission wording and its version, and signs the tailor in (FR-TPO-02, FR-TPO-07). */
export async function acceptInvite(
  db: D1Database,
  input: {
    token: string;
    email: string;
    password: string;
    consent: string;
    ip?: string;
  },
  now = new Date(),
): Promise<AcceptResult> {
  if (
    input.ip &&
    (await hit(db, `portal:accept:${input.ip}`, WINDOW_SECONDS, now)) >
      ACCEPT_LIMIT
  )
    return { ok: false, error: 'limited' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      ok: false,
      error:
        field === 'password'
          ? 'password'
          : field === 'consent'
            ? 'consent'
            : 'email',
    };
  }
  const result = await consumeInvite(
    db,
    input.token,
    {
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      consentVersion: en.portal.consentVersion,
    },
    now,
  );
  if (!result.ok)
    return {
      ok: false,
      error: result.reason === 'email_taken' ? 'email_taken' : 'invalid_link',
    };
  const session = await createTailorSession(db, result.accountId, now);
  await audit(db, {
    userId: null,
    tailorAccountId: result.accountId,
    action: 'portal_account_activated',
    entityType: 'tailor',
    entityId: result.tailorId,
  });
  return { ok: true, ...session };
}
