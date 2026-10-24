import { audit } from './audit';
import {
  dummyVerify,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './password';
import { hit, ipBucket, refund } from './rate-limit';
import { createSession, revokeSession } from './session';

export const IP_LIMIT = 5;
/** Per-email ceiling for guessing spread over many addresses. High on purpose: a low one lets anyone lock the owner out. */
export const EMAIL_LIMIT = 50;
export const WINDOW_SECONDS = 15 * 60;

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; userId: number }
  | { ok: false; limited: boolean };

type Credentials = {
  email: string;
  password: string;
  ip?: string;
  previousToken?: string;
};
type UserRow = { id: number; password_hash: string; is_active: number };

/**
 * Every failure looks the same to the caller (unknown user, wrong password, inactive user, empty password);
 * only a rate-limit refusal is distinguishable, and it is keyed on what was submitted, not on whether the account exists.
 * The attempt is counted before the password is checked (atomically), so parallel guesses cannot slip past the limit;
 * a successful sign-in gives its attempt back.
 */
export async function login(
  db: D1Database,
  { email, password, ip, previousToken }: Credentials,
  now = new Date(),
): Promise<LoginResult> {
  const normalised = email.trim().toLowerCase();
  // No address (not behind Cloudflare, e.g. local dev): count by email only instead of sharing one bucket for everyone.
  const ipKey = ip ? `login:ip:${ipBucket(ip)}` : null;
  const emailKey = `login:email:${normalised}`;

  const [ipHits, emailHits] = await Promise.all([
    ipKey ? hit(db, ipKey, WINDOW_SECONDS, now) : 0,
    hit(db, emailKey, WINDOW_SECONDS, now),
  ]);
  if (ipHits > IP_LIMIT || emailHits > EMAIL_LIMIT)
    return { ok: false, limited: true };

  const user = await db
    .prepare(
      'SELECT id, password_hash, is_active FROM admin_user WHERE email = ?',
    )
    .bind(normalised)
    .first<UserRow>();
  // An unknown user costs the same time as a real one (dummyVerify uses today's rounds setting).
  const passwordOk = user
    ? await verifyPassword(password, user.password_hash)
    : await dummyVerify(password);

  if (!user || !user.is_active || !passwordOk) {
    await audit(db, { userId: user?.id ?? null, action: 'login_failed' });
    return { ok: false, limited: false };
  }

  await Promise.all([
    ipKey ? refund(db, ipKey, WINDOW_SECONDS, now) : null,
    refund(db, emailKey, WINDOW_SECONDS, now),
  ]);
  if (needsRehash(user.password_hash)) {
    await db
      .prepare('UPDATE admin_user SET password_hash = ? WHERE id = ?')
      .bind(await hashPassword(password), user.id)
      .run();
  }
  await db
    .prepare('UPDATE admin_user SET last_login_at = ? WHERE id = ?')
    .bind(now.toISOString(), user.id)
    .run();
  if (previousToken) await revokeSession(db, previousToken);
  const session = await createSession(db, user.id, now);
  await audit(db, { userId: user.id, action: 'login' });
  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    userId: user.id,
  };
}
