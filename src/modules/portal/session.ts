import { csrfTokenFor } from '../auth/csrf';
import { hashToken, newToken } from '../auth/session';

// A tailor's own sign-in, kept apart from staff sessions: a different table, cookie and guard, so neither kind of session can be used for the other's pages.
export const TAILOR_COOKIE = '__Host-alfaiate_tailor';
/** Longer idle time than staff: a tailor may be typing a description or choosing photos on a phone. */
export const TAILOR_IDLE_MS = 2 * 60 * 60_000;
export const TAILOR_ABSOLUTE_MS = 24 * 60 * 60_000;

export type TailorSession = {
  accountId: number;
  /** The one tailor this person may touch. It comes only from here, never from a URL or form. */
  tailorId: number;
  email: string;
  csrfToken: string;
};

export async function createTailorSession(
  db: D1Database,
  accountId: number,
  now = new Date(),
) {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + TAILOR_ABSOLUTE_MS).toISOString();
  await db
    .prepare(
      'INSERT INTO tailor_session (token_hash, tailor_account_id, last_seen_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(await hashToken(token), accountId, now.toISOString(), expiresAt)
    .run();
  return { token, expiresAt: new Date(expiresAt) };
}

type Row = {
  id: number;
  tailor_account_id: number;
  tailor_id: number;
  email: string | null;
  is_active: number;
  last_seen_at: string;
  expires_at: string;
};

export async function validateTailorSession(
  db: D1Database,
  token: string,
  now = new Date(),
): Promise<TailorSession | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT s.id, s.tailor_account_id, a.tailor_id, a.email, a.is_active, s.last_seen_at, s.expires_at
       FROM tailor_session s JOIN tailor_account a ON a.id = s.tailor_account_id WHERE s.token_hash = ?`,
    )
    .bind(await hashToken(token))
    .first<Row>();
  if (!row) return null;
  const expired =
    now.getTime() > new Date(row.last_seen_at).getTime() + TAILOR_IDLE_MS ||
    now.toISOString() > row.expires_at;
  if (expired || !row.is_active || !row.email) {
    await db
      .prepare('DELETE FROM tailor_session WHERE id = ?')
      .bind(row.id)
      .run();
    return null;
  }
  await db
    .prepare('UPDATE tailor_session SET last_seen_at = ? WHERE id = ?')
    .bind(now.toISOString(), row.id)
    .run();
  return {
    accountId: row.tailor_account_id,
    tailorId: row.tailor_id,
    email: row.email,
    csrfToken: await csrfTokenFor(token),
  };
}

export async function revokeTailorSession(db: D1Database, token: string) {
  await db
    .prepare('DELETE FROM tailor_session WHERE token_hash = ?')
    .bind(await hashToken(token))
    .run();
}

/** Ends every session of one account (password change, deactivation), optionally keeping the one in use. */
export async function revokeTailorSessions(
  db: D1Database,
  accountId: number,
  keepToken?: string,
) {
  await db
    .prepare(
      'DELETE FROM tailor_session WHERE tailor_account_id = ? AND token_hash <> ?',
    )
    .bind(accountId, keepToken ? await hashToken(keepToken) : '')
    .run();
}
