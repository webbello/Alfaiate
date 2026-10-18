import { z } from 'zod';
import { audit } from './audit';
import { hashPassword, verifyPassword } from './password';
import { ROLES, type Role } from './permissions';
import { revokeUserSessions } from './session';
import { LastOwnerError, setActive, setRole } from './users';

export const MIN_PASSWORD_LENGTH = 12;

export type Outcome =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'invalid'
        | 'email_taken'
        | 'last_owner'
        | 'not_found'
        | 'wrong_password';
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
    return { ok: true };
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
  await revokeUserSessions(db, userId, currentToken);
  await audit(db, {
    userId,
    action: 'password_changed',
    entityType: 'admin_user',
    entityId: userId,
  });
  return { ok: true };
}
