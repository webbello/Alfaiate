import { audit } from './audit';
import { hashPassword, needsRehash, verifyPassword } from './password';
import { countHits, recordHit } from './rate-limit';
import { createSession, revokeSession } from './session';

export const IP_LIMIT = 5;
export const EMAIL_LIMIT = 20;
export const WINDOW_SECONDS = 15 * 60;

// A valid hash of a random value nobody knows, so unknown and inactive users cost the same time as real ones.
// Generated with 600000 iterations; regenerate if DEFAULT_ITERATIONS changes.
export const DUMMY_HASH =
  'pbkdf2-sha256$600000$hgXZXHCFHXNMzJIcjID1RA$x30TVpnOJvzLCq7tE6gzOCtanXmRkIT-_HSjJ0Kn8cU';

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; userId: number }
  | { ok: false; limited: boolean };

type Credentials = {
  email: string;
  password: string;
  ip: string;
  previousToken?: string;
};
type UserRow = { id: number; password_hash: string; is_active: number };

/**
 * Every failure looks the same to the caller (unknown user, wrong password, inactive user, empty password);
 * only a rate-limit refusal is distinguishable, and it is keyed on what was submitted, not on whether the account exists.
 */
export async function login(
  db: D1Database,
  { email, password, ip, previousToken }: Credentials,
  now = new Date(),
): Promise<LoginResult> {
  const normalised = email.trim().toLowerCase();
  const ipKey = `login:ip:${ip}`;
  const emailKey = `login:email:${normalised}`;

  const [ipHits, emailHits] = await Promise.all([
    countHits(db, ipKey, WINDOW_SECONDS, now),
    countHits(db, emailKey, WINDOW_SECONDS, now),
  ]);
  if (ipHits >= IP_LIMIT || emailHits >= EMAIL_LIMIT)
    return { ok: false, limited: true };

  const user = await db
    .prepare(
      'SELECT id, password_hash, is_active FROM admin_user WHERE email = ?',
    )
    .bind(normalised)
    .first<UserRow>();
  const passwordOk = await verifyPassword(
    password,
    user?.password_hash ?? DUMMY_HASH,
  );

  if (!user || !user.is_active || !passwordOk) {
    await Promise.all([
      recordHit(db, ipKey, WINDOW_SECONDS, now),
      recordHit(db, emailKey, WINDOW_SECONDS, now),
    ]);
    await audit(db, { userId: user?.id ?? null, action: 'login_failed' });
    return { ok: false, limited: false };
  }

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
