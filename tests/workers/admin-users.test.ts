import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  MIN_PASSWORD_LENGTH,
  changeOwnPassword,
  createUser,
  deactivateUser,
  reactivateUser,
  updateRole,
} from '../../src/modules/auth/admin-users';
import { hashPassword, verifyPassword } from '../../src/modules/auth/password';
import { createSession, validateSession } from '../../src/modules/auth/session';

const db = env.DB;
const GOOD = 'a-long-fake-test-passphrase';
let n = 0;
const addUser = async (role = 'owner', password = GOOD) => {
  const email = `au${++n}@example.test`;
  const id = (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(email, await hashPassword(password, 1000), role)
      .run()
  ).meta.last_row_id;
  return { id, email };
};
const auditActions = async (userId: number) =>
  (
    await db
      .prepare(
        'SELECT action FROM audit_log WHERE admin_user_id = ? ORDER BY id',
      )
      .bind(userId)
      .all<{ action: string }>()
  ).results.map((r) => r.action);

describe('createUser', () => {
  it('creates a user with a hashed password and audits who did it', async () => {
    const actor = await addUser();
    const result = await createUser(db, actor.id, {
      email: ' New.Person@Example.test ',
      role: 'editor',
      password: GOOD,
    });
    expect(result.ok).toBe(true);
    const row = await db
      .prepare(
        'SELECT email, role, is_active, password_hash FROM admin_user WHERE email = ?',
      )
      .bind('new.person@example.test')
      .first<Record<string, unknown>>();
    expect(row).toMatchObject({ role: 'editor', is_active: 1 });
    expect(String(row?.password_hash)).not.toContain(GOOD);
    expect(await verifyPassword(GOOD, String(row?.password_hash))).toBe(true);
    expect(await auditActions(actor.id)).toContain('user_created');
  });

  it('refuses a short password, a bad email, an unknown role and a duplicate email', async () => {
    const actor = await addUser();
    const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(
      await createUser(db, actor.id, {
        email: 'a@example.test',
        role: 'editor',
        password: short,
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await createUser(db, actor.id, {
        email: 'not-an-email',
        role: 'editor',
        password: GOOD,
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await createUser(db, actor.id, {
        email: 'b@example.test',
        role: 'admin',
        password: GOOD,
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    await createUser(db, actor.id, {
      email: 'dup@example.test',
      role: 'viewer',
      password: GOOD,
    });
    expect(
      await createUser(db, actor.id, {
        email: 'DUP@example.test',
        role: 'viewer',
        password: GOOD,
      }),
    ).toEqual({ ok: false, error: 'email_taken' });
  });
});

describe('updateRole, deactivateUser, reactivateUser', () => {
  it('changes a role and audits it', async () => {
    const actor = await addUser();
    const target = await addUser('viewer');
    expect(await updateRole(db, actor.id, target.id, 'manager')).toEqual({
      ok: true,
    });
    expect(
      (
        await db
          .prepare('SELECT role FROM admin_user WHERE id = ?')
          .bind(target.id)
          .first<{ role: string }>()
      )?.role,
    ).toBe('manager');
    expect(await auditActions(actor.id)).toContain('role_changed');
  });

  it('refuses to demote or deactivate the last active owner', async () => {
    await db.prepare('DELETE FROM admin_user').run();
    const owner = await addUser('owner');
    expect(await updateRole(db, owner.id, owner.id, 'viewer')).toEqual({
      ok: false,
      error: 'last_owner',
    });
    expect(await deactivateUser(db, owner.id, owner.id)).toEqual({
      ok: false,
      error: 'last_owner',
    });
    expect(await auditActions(owner.id)).not.toContain('role_changed');
  });

  it('reports an unknown user and an unknown role', async () => {
    const actor = await addUser();
    expect(await updateRole(db, actor.id, 99999, 'viewer')).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(await updateRole(db, actor.id, actor.id, 'root')).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('deactivation ends sessions at once and reactivation restores sign-in ability', async () => {
    const actor = await addUser();
    const target = await addUser('editor');
    const { token } = await createSession(db, target.id);
    expect(await deactivateUser(db, actor.id, target.id)).toEqual({ ok: true });
    expect(await validateSession(db, token)).toBeNull();
    expect(await auditActions(actor.id)).toContain('user_deactivated');
    expect(await reactivateUser(db, actor.id, target.id)).toEqual({ ok: true });
    expect(
      (
        await db
          .prepare('SELECT is_active FROM admin_user WHERE id = ?')
          .bind(target.id)
          .first<{ is_active: number }>()
      )?.is_active,
    ).toBe(1);
    expect(await auditActions(actor.id)).toContain('user_reactivated');
  });
});

describe('changeOwnPassword', () => {
  it('needs the current password and a different, long enough new one', async () => {
    const user = await addUser();
    const { token } = await createSession(db, user.id);
    expect(
      await changeOwnPassword(db, user.id, token, {
        current: 'wrong-wrong-wrong',
        next: 'a-brand-new-passphrase',
      }),
    ).toEqual({ ok: false, error: 'wrong_password' });
    expect(
      await changeOwnPassword(db, user.id, token, {
        current: GOOD,
        next: 'short',
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await changeOwnPassword(db, user.id, token, {
        current: GOOD,
        next: GOOD,
      }),
    ).toEqual({ ok: false, error: 'invalid' });
  });

  it('stores a new hash, keeps the current session and ends the others (SEC-01)', async () => {
    const user = await addUser();
    const current = await createSession(db, user.id);
    const other = await createSession(db, user.id);
    expect(
      await changeOwnPassword(db, user.id, current.token, {
        current: GOOD,
        next: 'a-brand-new-passphrase',
      }),
    ).toEqual({ ok: true });
    const row = await db
      .prepare('SELECT password_hash FROM admin_user WHERE id = ?')
      .bind(user.id)
      .first<{ password_hash: string }>();
    expect(
      await verifyPassword('a-brand-new-passphrase', row!.password_hash),
    ).toBe(true);
    expect(await verifyPassword(GOOD, row!.password_hash)).toBe(false);
    expect(await validateSession(db, current.token)).not.toBeNull();
    expect(await validateSession(db, other.token)).toBeNull();
    expect(await auditActions(user.id)).toContain('password_changed');
  });
});
