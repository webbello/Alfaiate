import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  ABSOLUTE_MS,
  IDLE_MS,
  KEEP_MS,
  createSession,
  revokeSession,
  revokeUserSessions,
  validateSession,
} from '../../src/modules/auth/session';
import { setActive } from '../../src/modules/auth/users';

const db = env.DB;
const T0 = new Date('2026-06-01T09:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;
let n = 0;
const addUser = async (role = 'owner', active = 1) =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role, is_active) VALUES (?, ?, ?, ?)',
      )
      .bind(`s${++n}@example.test`, 'h', role, active)
      .run()
  ).meta.last_row_id;

describe('session lifetimes', () => {
  it('uses 30 minutes idle and 12 hours absolute (owner decision, 2026-10-18)', () => {
    expect(IDLE_MS).toBe(30 * MIN);
    expect(ABSOLUTE_MS).toBe(12 * 60 * MIN);
  });
});

describe('createSession', () => {
  it('stores only a hash of the token, never the token itself', async () => {
    const user = await addUser();
    const { token } = await createSession(db, user, T0);
    const rows = await db
      .prepare('SELECT token_hash FROM admin_session WHERE admin_user_id = ?')
      .bind(user)
      .all<{ token_hash: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].token_hash).not.toContain(token);
    expect(rows.results[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('issues a different, long random token each time', async () => {
    const user = await addUser();
    const a = await createSession(db, user, T0);
    const b = await createSession(db, user, T0);
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
  });
});

describe('validateSession', () => {
  it('returns the user, role and a csrf token for a fresh session', async () => {
    const user = await addUser('manager');
    const { token } = await createSession(db, user, T0);
    const session = await validateSession(db, token, after(MIN));
    expect(session).toMatchObject({ userId: user, role: 'manager' });
    expect(session?.email).toMatch(/@example\.test$/);
    expect(session?.csrfToken.length).toBeGreaterThan(20);
  });

  it('rejects an unknown or empty token', async () => {
    expect(await validateSession(db, 'nope', T0)).toBeNull();
    expect(await validateSession(db, '', T0)).toBeNull();
  });

  it('expires after 30 minutes of inactivity and removes the row', async () => {
    const user = await addUser();
    const { token } = await createSession(db, user, T0);
    expect(await validateSession(db, token, after(IDLE_MS + MIN))).toBeNull();
    expect(
      await db
        .prepare('SELECT 1 FROM admin_session WHERE admin_user_id = ?')
        .bind(user)
        .first(),
    ).toBeNull();
  });

  it('stays valid while the user is active, up to the idle window each time', async () => {
    const user = await addUser();
    const { token } = await createSession(db, user, T0);
    expect(await validateSession(db, token, after(20 * MIN))).not.toBeNull();
    expect(await validateSession(db, token, after(45 * MIN))).not.toBeNull();
  });

  it('expires 12 hours after sign-in even when continuously active', async () => {
    const user = await addUser();
    const { token } = await createSession(db, user, T0);
    for (let minute = 20; minute < 12 * 60; minute += 20) {
      expect(
        await validateSession(db, token, after(minute * MIN)),
      ).not.toBeNull();
    }
    expect(
      await validateSession(db, token, after(ABSOLUTE_MS + MIN)),
    ).toBeNull();
  });

  it('refuses a session whose user has been deactivated', async () => {
    const user = await addUser();
    await addUser(); // second owner so deactivation is allowed
    const { token } = await createSession(db, user, T0);
    await db
      .prepare('UPDATE admin_user SET is_active = 0 WHERE id = ?')
      .bind(user)
      .run();
    expect(await validateSession(db, token, after(MIN))).toBeNull();
  });
});

describe('revocation', () => {
  it('revokeSession ends that session only', async () => {
    const user = await addUser();
    const a = await createSession(db, user, T0);
    const b = await createSession(db, user, T0);
    await revokeSession(db, a.token);
    expect(await validateSession(db, a.token, after(MIN))).toBeNull();
    expect(await validateSession(db, b.token, after(MIN))).not.toBeNull();
  });

  it('revokeUserSessions ends all of a user sessions except the one kept', async () => {
    const user = await addUser();
    const a = await createSession(db, user, T0);
    const b = await createSession(db, user, T0);
    await revokeUserSessions(db, user, b.token);
    expect(await validateSession(db, a.token, after(MIN))).toBeNull();
    expect(await validateSession(db, b.token, after(MIN))).not.toBeNull();
  });

  it('deactivating a user revokes their sessions', async () => {
    await addUser('owner');
    const editor = await addUser('editor');
    const { token } = await createSession(db, editor, T0);
    await setActive(db, editor, false);
    expect(
      await db
        .prepare('SELECT 1 FROM admin_session WHERE admin_user_id = ?')
        .bind(editor)
        .first(),
    ).toBeNull();
    expect(await validateSession(db, token, after(MIN))).toBeNull();
  });
});

describe('keep me signed in (FR-ADM-18)', () => {
  const DAY = 24 * 60 * MIN;
  it('lasts 30 days idle, ends after that, and an ordinary session still ends after 30 idle minutes', async () => {
    expect(KEEP_MS).toBe(30 * DAY);
    const user = await addUser();
    const keep = await createSession(db, user, T0, { keep: true });
    expect(keep.expiresAt.getTime()).toBe(T0.getTime() + 30 * DAY);
    expect(
      await validateSession(db, keep.token, after(29 * DAY)),
    ).not.toBeNull();
    const dropped = await createSession(db, user, T0, { keep: true });
    expect(
      await validateSession(db, dropped.token, after(31 * DAY)),
    ).toBeNull();
    const plain = await createSession(db, user, T0);
    expect(await validateSession(db, plain.token, after(31 * MIN))).toBeNull();
    const plain2 = await createSession(db, user, T0);
    expect(
      await validateSession(db, plain2.token, after(13 * 60 * MIN)),
    ).toBeNull(); // the 12 hour limit
  });

  it('renews on every use: still signed in after 60 days if used every 20', async () => {
    const user = await addUser();
    const { token } = await createSession(db, user, T0, { keep: true });
    for (let day = 20; day <= 60; day += 20)
      expect(
        await validateSession(db, token, after(day * DAY)),
        `day ${day}`,
      ).not.toBeNull();
    expect(await validateSession(db, token, after(91 * DAY))).toBeNull();
  });

  it('asks for a fresh cookie only for a keep session used more than a day after its last renewal', async () => {
    const user = await addUser();
    const keep = await createSession(db, user, T0, { keep: true });
    expect(
      (await validateSession(db, keep.token, after(2 * MIN)))?.renewCookieUntil,
    ).toBeUndefined();
    const later = await validateSession(db, keep.token, after(2 * DAY));
    expect(later?.renewCookieUntil?.getTime()).toBe(
      after(2 * DAY).getTime() + 30 * DAY,
    );
    const plain = await createSession(db, user, T0);
    expect(
      (await validateSession(db, plain.token, after(10 * MIN)))
        ?.renewCookieUntil,
    ).toBeUndefined();
  });

  it('ends when the account is switched off, whatever the session length', async () => {
    const user = await addUser();
    const { token } = await createSession(db, user, T0, { keep: true });
    await db
      .prepare('UPDATE admin_user SET is_active = 0 WHERE id = ?')
      .bind(user)
      .run();
    expect(await validateSession(db, token, after(MIN))).toBeNull();
  });
});
