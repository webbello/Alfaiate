import { audit } from '../auth/audit';
import {
  EMAIL_LIMIT,
  IP_LIMIT,
  WINDOW_SECONDS,
} from '../auth/login';
import {
  dummyVerify,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../auth/password';
import { hit, ipBucket, refund } from '../auth/rate-limit';
import { createTailorSession, revokeTailorSession } from './session';

export type PortalLoginResult =
  | { ok: true; token: string; expiresAt: Date; accountId: number }
  | { ok: false; limited: boolean };

type Row = { id: number; password_hash: string | null; is_active: number };

/** Same rules as the staff sign-in: one answer for every failure, attempts counted before the password is checked, a success gives its attempt back. */
export async function portalLogin(
  db: D1Database,
  input: {
    email: string;
    password: string;
    ip?: string;
    previousToken?: string;
  },
  now = new Date(),
): Promise<PortalLoginResult> {
  const email = input.email.trim().toLowerCase();
  const ipKey = input.ip ? `portal:ip:${ipBucket(input.ip)}` : null;
  const emailKey = `portal:email:${email}`;
  const [ipHits, emailHits] = await Promise.all([
    ipKey ? hit(db, ipKey, WINDOW_SECONDS, now) : 0,
    hit(db, emailKey, WINDOW_SECONDS, now),
  ]);
  if (ipHits > IP_LIMIT || emailHits > EMAIL_LIMIT)
    return { ok: false, limited: true };

  const account = await db
    .prepare(
      'SELECT id, password_hash, is_active FROM tailor_account WHERE email = ?',
    )
    .bind(email)
    .first<Row>();
  const ok = account?.password_hash
    ? await verifyPassword(input.password, account.password_hash)
    : await dummyVerify(input.password);
  if (!account || !account.password_hash || !account.is_active || !ok) {
    await audit(db, {
      userId: null,
      tailorAccountId: account?.id,
      action: 'portal_login_failed',
    });
    return { ok: false, limited: false };
  }
  await Promise.all([
    ipKey ? refund(db, ipKey, WINDOW_SECONDS, now) : null,
    refund(db, emailKey, WINDOW_SECONDS, now),
  ]);
  if (needsRehash(account.password_hash))
    await db
      .prepare('UPDATE tailor_account SET password_hash = ? WHERE id = ?')
      .bind(await hashPassword(input.password), account.id)
      .run();
  await db
    .prepare('UPDATE tailor_account SET last_login_at = ? WHERE id = ?')
    .bind(now.toISOString(), account.id)
    .run();
  if (input.previousToken) await revokeTailorSession(db, input.previousToken);
  const session = await createTailorSession(db, account.id, now);
  await audit(db, {
    userId: null,
    tailorAccountId: account.id,
    action: 'portal_login',
  });
  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    accountId: account.id,
  };
}
