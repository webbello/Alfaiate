import { csrfTokenFor } from './csrf';
import type { Role } from './permissions';

export const IDLE_MS = 30 * 60_000;
export const ABSOLUTE_MS = 12 * 60 * 60_000;

export const SESSION_COOKIE = '__Host-alfaiate_session';

export type Session = {
  userId: number;
  email: string;
  role: Role;
  csrfToken: string;
};

const encoder = new TextEncoder();

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** Creates a session and returns the raw token for the cookie; only its hash is stored. Call on every sign-in (rotation). */
export async function createSession(
  db: D1Database,
  userId: number,
  now = new Date(),
) {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + ABSOLUTE_MS).toISOString();
  await db
    .prepare(
      'INSERT INTO session (token_hash, admin_user_id, last_seen_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(await hashToken(token), userId, now.toISOString(), expiresAt)
    .run();
  return { token, expiresAt: new Date(expiresAt) };
}

type Row = {
  id: number;
  admin_user_id: number;
  email: string;
  role: Role;
  is_active: number;
  last_seen_at: string;
  expires_at: string;
};

export async function validateSession(
  db: D1Database,
  token: string,
  now = new Date(),
): Promise<Session | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT s.id, s.admin_user_id, u.email, u.role, u.is_active, s.last_seen_at, s.expires_at
       FROM session s JOIN admin_user u ON u.id = s.admin_user_id WHERE s.token_hash = ?`,
    )
    .bind(await hashToken(token))
    .first<Row>();
  if (!row) return null;

  const idleDeadline = new Date(row.last_seen_at).getTime() + IDLE_MS;
  const expired =
    now.getTime() > idleDeadline || now.toISOString() > row.expires_at;
  if (expired || !row.is_active) {
    await db.prepare('DELETE FROM session WHERE id = ?').bind(row.id).run();
    return null;
  }
  await db
    .prepare('UPDATE session SET last_seen_at = ? WHERE id = ?')
    .bind(now.toISOString(), row.id)
    .run();
  return {
    userId: row.admin_user_id,
    email: row.email,
    role: row.role,
    csrfToken: await csrfTokenFor(token),
  };
}

export async function revokeSession(
  db: D1Database,
  token: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM session WHERE token_hash = ?')
    .bind(await hashToken(token))
    .run();
}

/** Ends all of a user's sessions, optionally keeping the one in use (password change). */
export async function revokeUserSessions(
  db: D1Database,
  userId: number,
  keepToken?: string,
): Promise<void> {
  const keepHash = keepToken ? await hashToken(keepToken) : '';
  await db
    .prepare('DELETE FROM session WHERE admin_user_id = ? AND token_hash <> ?')
    .bind(userId, keepHash)
    .run();
}
