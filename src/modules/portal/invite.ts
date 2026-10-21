import { hashToken, newToken } from '../auth/session';

/** An invite link works once and for a week; a new one replaces any unused older one (FR-TPO-02). */
export const INVITE_DAYS = 7;

/** Issues a fresh single-use token for the account and returns it. Only its hash is stored, so it can be shown once and never again. */
export async function issueInvite(
  db: D1Database,
  accountId: number,
  now = new Date(),
): Promise<string> {
  const token = newToken();
  const expires = new Date(now.getTime() + INVITE_DAYS * 86_400_000);
  await db.batch([
    db
      .prepare(
        'DELETE FROM tailor_invite WHERE tailor_account_id = ? AND used_at IS NULL',
      )
      .bind(accountId),
    db
      .prepare(
        'INSERT INTO tailor_invite (tailor_account_id, token_hash, expires_at) VALUES (?, ?, ?)',
      )
      .bind(accountId, await hashToken(token), expires.toISOString()),
  ]);
  return token;
}

export type InviteInfo = { accountId: number; tailorId: number; name: string };

/** Looks at a token without using it, for showing the "choose a password" page. Null for unknown, used, expired or deactivated. */
export async function lookupInvite(
  db: D1Database,
  token: string,
  now = new Date(),
): Promise<InviteInfo | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT a.id AS accountId, a.tailor_id AS tailorId, t.display_name AS name
       FROM tailor_invite i JOIN tailor_account a ON a.id = i.tailor_account_id JOIN tailor t ON t.id = a.tailor_id
       WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ? AND a.is_active = 1`,
    )
    .bind(await hashToken(token), now.toISOString())
    .first<InviteInfo>();
  return row ?? null;
}

export type Activation = {
  email: string;
  passwordHash: string;
  consentVersion: string;
};
export type ConsumeResult =
  | { ok: true; accountId: number; tailorId: number }
  | { ok: false; reason: 'invalid' | 'email_taken' };

/**
 * Uses the token and sets the account's email, password and consent in one transaction: the first statement claims the token
 * (only while unused and unexpired), the second runs only if the claim worked (`changes() = 1`), so a second use or a race changes nothing.
 */
export async function consumeInvite(
  db: D1Database,
  token: string,
  activation: Activation,
  now = new Date(),
): Promise<ConsumeResult> {
  const info = await lookupInvite(db, token, now);
  if (!info) return { ok: false, reason: 'invalid' };
  const stamp = now.toISOString();
  try {
    const [claim] = await db.batch([
      db
        .prepare(
          'UPDATE tailor_invite SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
        )
        .bind(stamp, await hashToken(token), stamp),
      db
        .prepare(
          `UPDATE tailor_account SET email = ?, password_hash = ?, consent_version = ?, consent_at = ?, updated_at = ?
           WHERE id = ? AND changes() = 1`,
        )
        .bind(
          activation.email,
          activation.passwordHash,
          activation.consentVersion,
          stamp,
          stamp,
          info.accountId,
        ),
      // A new password (a reset) ends every older session of this account; runs only if the account update just worked.
      db
        .prepare(
          'DELETE FROM tailor_session WHERE tailor_account_id = ? AND changes() = 1',
        )
        .bind(info.accountId),
    ]);
    if (claim.meta.changes !== 1) return { ok: false, reason: 'invalid' };
  } catch (error) {
    if (String(error).includes('UNIQUE'))
      return { ok: false, reason: 'email_taken' };
    throw error;
  }
  return { ok: true, accountId: info.accountId, tailorId: info.tailorId };
}
