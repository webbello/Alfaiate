import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  ABSOLUTE_MS,
  IDLE_MS,
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
