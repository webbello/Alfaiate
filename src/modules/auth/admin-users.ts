import { z } from 'zod';
import { audit } from './audit';
import { hashPassword, verifyPassword } from './password';
import { ROLES, type Role } from './permissions';
import { hit, refund } from './rate-limit';
import { revokeUserSessions } from './session';
import { LastOwnerError, setActive, setRole } from './users';

export const MIN_PASSWORD_LENGTH = 12;
const CHANGE_LIMIT = 5;
const CHANGE_WINDOW_SECONDS = 15 * 60;

export type Outcome =
  | { ok: true; id?: number }
  | {
      ok: false;
      error:
        | 'invalid'
        | 'email_taken'
        | 'last_owner'
        | 'not_found'
        | 'wrong_password'
        | 'limited';
    };

const password = z.string().min(MIN_PASSWORD_LENGTH).max(1024);
const newUser = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.enum(ROLES),
  password,
});

/** Maps the guarded updates in users.ts to outcomes the UI can show. */
async function attempt(run: () => Promise<void>): Promise<Outcome> {
  try {
    await run();
    return { ok: true };
  } catch (error) {
    if (error instanceof LastOwnerError)
      return { ok: false, error: 'last_owner' };
    if (error instanceof Error && error.message === 'User not found')
      return { ok: false, error: 'not_found' };
    throw error;
  }
}

export async function createUser(
  db: D1Database,
  actorId: number,
  input: { email: string; role: string; password: string },
): Promise<Outcome> {
  const parsed = newUser.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const { email, role, password: plain } = parsed.data;
  try {
    const created = await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(email, await hashPassword(plain), role)
      .run();
    await audit(db, {
      userId: actorId,
      action: 'user_created',
      entityType: 'admin_user',
      entityId: created.meta.last_row_id,
    });
    return { ok: true, id: created.meta.last_row_id };
  } catch (error) {
    if (error instanceof Error && /UNIQUE/i.test(error.message))
      return { ok: false, error: 'email_taken' };
    throw error;
  }
}

export async function updateRole(
  db: D1Database,
  actorId: number,
  targetId: number,
  role: string,
): Promise<Outcome> {
  const parsed = z.enum(ROLES).safeParse(role);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const outcome = await attempt(() =>
    setRole(db, targetId, parsed.data as Role),
  );
  if (outcome.ok)
    await audit(db, {
      userId: actorId,
      action: 'role_changed',
      entityType: 'admin_user',
      entityId: targetId,
    });
  return outcome;
}

export async function deactivateUser(
  db: D1Database,
  actorId: number,
  targetId: number,
): Promise<Outcome> {
  const outcome = await attempt(() => setActive(db, targetId, false));
  if (outcome.ok)
    await audit(db, {
      userId: actorId,
      action: 'user_deactivated',
      entityType: 'admin_user',
      entityId: targetId,
    });
  return outcome;
}

export async function reactivateUser(
  db: D1Database,
  actorId: number,
  targetId: number,
): Promise<Outcome> {
  const outcome = await attempt(() => setActive(db, targetId, true));
  if (outcome.ok)
    await audit(db, {
      userId: actorId,
      action: 'user_reactivated',
      entityType: 'admin_user',
      entityId: targetId,
    });
  return outcome;
}

/** Keeps the session in use and ends all the user's others (SEC-01). */
export async function changeOwnPassword(
  db: D1Database,
  userId: number,
  currentToken: string,
  input: { current: string; next: string },
): Promise<Outcome> {
  if (!password.safeParse(input.next).success || input.next === input.current)
    return { ok: false, error: 'invalid' };
  // Counted before the check, atomically, like sign-in: a stolen session must not be able to guess the current password.
  const key = `password-change:${userId}`;
  if ((await hit(db, key, CHANGE_WINDOW_SECONDS)) > CHANGE_LIMIT)
    return { ok: false, error: 'limited' };
  const row = await db
    .prepare('SELECT password_hash FROM admin_user WHERE id = ?')
    .bind(userId)
    .first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(input.current, row.password_hash)))
    return { ok: false, error: 'wrong_password' };
  await db
    .prepare('UPDATE admin_user SET password_hash = ? WHERE id = ?')
    .bind(await hashPassword(input.next), userId)
    .run();
  await refund(db, key, CHANGE_WINDOW_SECONDS);
  await revokeUserSessions(db, userId, currentToken);
  await audit(db, {
    userId,
    action: 'password_changed',
    entityType: 'admin_user',
    entityId: userId,
  });
  return { ok: true };
}

// No 0/O, 1/l/I or other look-alikes, so a password read out or typed from a screen is not misheard.
const PASSWORD_ALPHABET =
  'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXYZ2346789';

/** A readable one-time password: 16 characters, about 91 bits, drawn with rejection sampling so no character is likelier than another. */
export function generatePassword(length = 16): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length);
  let out = '';
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes)
      if (b < limit && out.length < length)
        out += PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length];
  }
  return out;
}

export type ResetOutcome =
  | { ok: true; password: string; email: string }
  | { ok: false; error: 'invalid' | 'not_found' };

/**
 * Sets a new generated password for someone else and ends all their sessions. The password is returned once, to be shown once;
 * it is never logged or stored in the clear. Your own password is changed under My account, so a reset of yourself is refused.
 */
export async function resetPassword(
  db: D1Database,
  actorId: number,
  targetId: number,
): Promise<ResetOutcome> {
  if (targetId === actorId) return { ok: false, error: 'invalid' };
  const target = await db
    .prepare('SELECT email FROM admin_user WHERE id = ?')
    .bind(targetId)
    .first<{ email: string }>();
  if (!target) return { ok: false, error: 'not_found' };
  const plain = generatePassword();
  await db
    .prepare(
      "UPDATE admin_user SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(await hashPassword(plain), targetId)
    .run();
  await revokeUserSessions(db, targetId);
  await audit(db, {
    userId: actorId,
    action: 'user_password_reset',
    entityType: 'admin_user',
    entityId: targetId,
  });
  return { ok: true, password: plain, email: target.email };
}

/** Ends every session of a user, for example a lost laptop. Not for yourself: Sign out does that. */
export async function signOutEverywhere(
  db: D1Database,
  actorId: number,
  targetId: number,
): Promise<Outcome> {
  if (targetId === actorId) return { ok: false, error: 'invalid' };
  const exists = await db
    .prepare('SELECT 1 FROM admin_user WHERE id = ?')
    .bind(targetId)
    .first();
  if (!exists) return { ok: false, error: 'not_found' };
  await revokeUserSessions(db, targetId);
  await audit(db, {
    userId: actorId,
    action: 'user_signed_out',
    entityType: 'admin_user',
    entityId: targetId,
  });
  return { ok: true };
}
