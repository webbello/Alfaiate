import { csrfTokenFor } from './csrf';
import type { Role } from './permissions';

export const IDLE_MS = 30 * 60_000;
export const ABSOLUTE_MS = 12 * 60 * 60_000;
/** "Keep me signed in" (FR-ADM-18): idle for up to 30 days is fine, and every use renews the 30 days. */
export const KEEP_MS = 30 * 24 * 60 * 60_000;
/** The cookie is re-issued at most about once a day, not on every request. */
const RENEW_AFTER_MS = 24 * 60 * 60_000;

export const SESSION_COOKIE = '__Host-alfaiate_session';

export type Session = {
  userId: number;
  email: string;
  role: Role;
  csrfToken: string;
  /** Set for a keep-me-signed-in session that was renewed more than a day ago: the guard re-issues the cookie until this time. */
  renewCookieUntil?: Date;
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
  options: { keep?: boolean } = {},
) {
  const token = newToken();
  const expiresAt = new Date(
    now.getTime() + (options.keep ? KEEP_MS : ABSOLUTE_MS),
  ).toISOString();
  await db
    .prepare(
      'INSERT INTO admin_session (token_hash, admin_user_id, last_seen_at, expires_at, keep_signed_in) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(
      await hashToken(token),
      userId,
      now.toISOString(),
      expiresAt,
      options.keep ? 1 : 0,
    )
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
  keep_signed_in: number;
};

export async function validateSession(
  db: D1Database,
  token: string,
  now = new Date(),
): Promise<Session | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT s.id, s.admin_user_id, u.email, u.role, u.is_active, s.last_seen_at, s.expires_at, s.keep_signed_in
       FROM admin_session s JOIN admin_user u ON u.id = s.admin_user_id WHERE s.token_hash = ?`,
    )
    .bind(await hashToken(token))
    .first<Row>();
  if (!row) return null;

  const keep = row.keep_signed_in === 1;
  const idleDeadline =
    new Date(row.last_seen_at).getTime() + (keep ? KEEP_MS : IDLE_MS);
  const expired =
    now.getTime() > idleDeadline || now.toISOString() > row.expires_at;
  if (expired || !row.is_active) {
    await db
      .prepare('DELETE FROM admin_session WHERE id = ?')
      .bind(row.id)
      .run();
    return null;
  }
  // A keep-me-signed-in session renews its 30 days on every use; the cookie is re-issued about once a day.
  const renewed = keep ? new Date(now.getTime() + KEEP_MS) : null;
  const renewCookie =
    renewed !== null &&
    new Date(row.expires_at).getTime() - now.getTime() <
      KEEP_MS - RENEW_AFTER_MS;
  await db
    .prepare(
      'UPDATE admin_session SET last_seen_at = ?, expires_at = coalesce(?, expires_at) WHERE id = ?',
    )
    .bind(now.toISOString(), renewed?.toISOString() ?? null, row.id)
    .run();
  return {
    userId: row.admin_user_id,
    email: row.email,
    role: row.role,
    csrfToken: await csrfTokenFor(token),
    ...(renewCookie && renewed ? { renewCookieUntil: renewed } : {}),
  };
}

export async function revokeSession(
  db: D1Database,
  token: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM admin_session WHERE token_hash = ?')
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
    .prepare(
      'DELETE FROM admin_session WHERE admin_user_id = ? AND token_hash <> ?',
    )
    .bind(userId, keepHash)
    .run();
}
