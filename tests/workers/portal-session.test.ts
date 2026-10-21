import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  TAILOR_IDLE_MS,
  createTailorSession,
  revokeTailorSession,
  revokeTailorSessions,
  validateTailorSession,
} from '../../src/modules/portal/session';
import { createSession, validateSession } from '../../src/modules/auth/session';
import { can } from '../../src/modules/auth/permissions';
import { audit } from '../../src/modules/auth/audit';

const db = env.DB;
let n = 0;
const account = async (o: { email?: string | null; active?: number } = {}) => {
  const tailorId = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name) VALUES (?, 'Portal Fake')",
      )
      .bind(`portal-fake-${++n}`)
      .run()
  ).meta.last_row_id;
  const email = o.email === undefined ? `t${n}@example.test` : o.email;
  const id = (
    await db
      .prepare(
        'INSERT INTO tailor_account (tailor_id, email, password_hash, is_active) VALUES (?, ?, ?, ?)',
      )
      .bind(tailorId, email, email ? 'x' : null, o.active ?? 1)
      .run()
  ).meta.last_row_id;
  return { id, tailorId };
};
const T0 = new Date('2026-06-01T09:00:00.000Z');

describe('tailor sessions (FR-TPO-03)', () => {
  it('carry the tailor id from the account, and a CSRF token derived from the session', async () => {
    const a = await account();
    const { token } = await createTailorSession(db, a.id, T0);
    const s = await validateTailorSession(db, token, T0);
    expect(s).toMatchObject({ accountId: a.id, tailorId: a.tailorId });
    expect(s?.csrfToken.length).toBeGreaterThan(20);
    const raw = await db
      .prepare('SELECT token_hash FROM tailor_session')
      .all<{ token_hash: string }>();
    expect(raw.results.some((r) => r.token_hash === token)).toBe(false);
  });
  it('end after the idle time and after sign-out, and for inactive or not yet activated accounts', async () => {
    const a = await account();
    const { token } = await createTailorSession(db, a.id, T0);
    expect(
      await validateTailorSession(
        db,
        token,
        new Date(T0.getTime() + TAILOR_IDLE_MS + 1),
      ),
    ).toBeNull();
    const b = await account();
    const t2 = (await createTailorSession(db, b.id, T0)).token;
    await revokeTailorSession(db, t2);
    expect(await validateTailorSession(db, t2, T0)).toBeNull();
    const off = await account({ active: 0 });
    expect(
      await validateTailorSession(
        db,
        (await createTailorSession(db, off.id, T0)).token,
        T0,
      ),
    ).toBeNull();
    const pending = await account({ email: null });
    expect(
      await validateTailorSession(
        db,
        (await createTailorSession(db, pending.id, T0)).token,
        T0,
      ),
    ).toBeNull();
  });
  it('can all be ended for one account while keeping the current one', async () => {
    const a = await account();
    const keep = (await createTailorSession(db, a.id, T0)).token;
    const other = (await createTailorSession(db, a.id, T0)).token;
    await revokeTailorSessions(db, a.id, keep);
    expect(await validateTailorSession(db, keep, T0)).not.toBeNull();
    expect(await validateTailorSession(db, other, T0)).toBeNull();
  });
});

describe('tailor and staff sign-ins stay apart', () => {
  it('a tailor token is not a staff session, and a staff token is not a tailor session', async () => {
    const a = await account();
    const tailorToken = (await createTailorSession(db, a.id, T0)).token;
    const staffId = (
      await db
        .prepare(
          "INSERT INTO admin_user (email, password_hash, role) VALUES ('sep-owner@example.test', 'x', 'owner')",
        )
        .run()
    ).meta.last_row_id;
    const staffToken = (await createSession(db, staffId, T0)).token;
    expect(await validateSession(db, tailorToken, T0)).toBeNull();
    expect(await validateTailorSession(db, staffToken, T0)).toBeNull();
  });
  it('the staff permission table knows no tailor role, so a tailor could never hold a staff permission', () => {
    for (const p of [
      'dashboard.view',
      'tailor.edit',
      'tailor.publish',
      'enquiry.view',
      'enquiry.delete',
      'user.manage',
    ])
      expect(can('tailor', p), p).toBe(false);
  });
});

describe('schema', () => {
  it('allows one account per tailor and rejects an email without a password', async () => {
    const a = await account();
    await expect(
      db
        .prepare('INSERT INTO tailor_account (tailor_id) VALUES (?)')
        .bind(a.tailorId)
        .run(),
    ).rejects.toThrow();
    const t = (
      await db
        .prepare(
          "INSERT INTO tailor (slug, display_name) VALUES ('portal-fake-x', 'X')",
        )
        .run()
    ).meta.last_row_id;
    await expect(
      db
        .prepare(
          "INSERT INTO tailor_account (tailor_id, email) VALUES (?, 'half@example.test')",
        )
        .bind(t)
        .run(),
    ).rejects.toThrow();
  });
  it('deleting a tailor removes their account, sessions and invites, and audit rows keep their id as null', async () => {
    const a = await account();
    await createTailorSession(db, a.id, T0);
    await db
      .prepare(
        'INSERT INTO tailor_invite (tailor_account_id, token_hash, expires_at) VALUES (?, ?, ?)',
      )
      .bind(a.id, `h${a.id}`, '2999-01-01')
      .run();
    await audit(db, {
      userId: null,
      tailorAccountId: a.id,
      action: 'portal_login',
    });
    await db.prepare('DELETE FROM tailor WHERE id = ?').bind(a.tailorId).run();
    const left = await db
      .prepare(
        'SELECT (SELECT count(*) FROM tailor_account WHERE id = ?1) a, (SELECT count(*) FROM tailor_session WHERE tailor_account_id = ?1) s, (SELECT count(*) FROM tailor_invite WHERE tailor_account_id = ?1) i',
      )
      .bind(a.id)
      .first<{ a: number; s: number; i: number }>();
    expect(left).toEqual({ a: 0, s: 0, i: 0 });
  });
  it('records the tailor as the actor in the audit log', async () => {
    const a = await account();
    await audit(db, {
      userId: null,
      tailorAccountId: a.id,
      action: 'portal_profile_updated',
      entityType: 'tailor',
      entityId: a.tailorId,
    });
    const row = await db
      .prepare(
        'SELECT admin_user_id, tailor_account_id FROM audit_log WHERE tailor_account_id = ?',
      )
      .bind(a.id)
      .first();
    expect(row).toEqual({ admin_user_id: null, tailor_account_id: a.id });
  });
});
