import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  LastOwnerError,
  setActive,
  setRole,
} from '../../src/modules/auth/users';

const db = env.DB;
let n = 0;
const addUser = async (role: string, active = 1) =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role, is_active) VALUES (?, ?, ?, ?)',
      )
      .bind(`u${++n}@example.test`, 'h', role, active)
      .run()
  ).meta.last_row_id;
const read = (id: number) =>
  db
    .prepare('SELECT role, is_active FROM admin_user WHERE id = ?')
    .bind(id)
    .first<{ role: string; is_active: number }>();
// Each test starts from an empty user table so "last owner" is well defined.
const reset = () => db.prepare('DELETE FROM admin_user').run();

describe('last active owner rule (SEC-09)', () => {
  it('refuses to demote the only active owner', async () => {
    await reset();
    const owner = await addUser('owner');
    await expect(setRole(db, owner, 'manager')).rejects.toThrow(LastOwnerError);
    expect((await read(owner))?.role).toBe('owner');
  });

  it('refuses to deactivate the only active owner', async () => {
    await reset();
    const owner = await addUser('owner');
    await expect(setActive(db, owner, false)).rejects.toThrow(LastOwnerError);
    expect((await read(owner))?.is_active).toBe(1);
  });

  it('counts only active owners: a second but inactive owner does not help', async () => {
    await reset();
    const owner = await addUser('owner');
    await addUser('owner', 0);
    await expect(setRole(db, owner, 'viewer')).rejects.toThrow(LastOwnerError);
  });

  it('allows demoting or deactivating an owner while another active owner exists', async () => {
    await reset();
    const a = await addUser('owner');
    const b = await addUser('owner');
    await setRole(db, a, 'manager');
    expect((await read(a))?.role).toBe('manager');
    await expect(setActive(db, b, false)).rejects.toThrow(LastOwnerError);
  });

  it('allows changing and deactivating non-owners, and promoting to owner', async () => {
    await reset();
    await addUser('owner');
    const editor = await addUser('editor');
    await setRole(db, editor, 'manager');
    await setActive(db, editor, false);
    await setActive(db, editor, true);
    await setRole(db, editor, 'owner');
    expect((await read(editor))?.role).toBe('owner');
  });

  it('keeps an owner an owner when asked to set the same role', async () => {
    await reset();
    const owner = await addUser('owner');
    await setRole(db, owner, 'owner');
    expect((await read(owner))?.role).toBe('owner');
  });

  it('rejects an unknown role and an unknown user', async () => {
    await reset();
    const user = await addUser('owner');
    await addUser('owner');
    await expect(setRole(db, user, 'admin' as never)).rejects.toThrow();
    await expect(setRole(db, 99999, 'viewer')).rejects.toThrow(/not found/i);
  });
});
