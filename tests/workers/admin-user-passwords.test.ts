import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  generatePassword,
  resetPassword,
  signOutEverywhere,
} from '../../src/modules/auth/admin-users';
import { hashPassword, verifyPassword } from '../../src/modules/auth/password';
import { listUsers } from '../../src/modules/auth/user-directory';

// Admin users, QuizCub-style: generated one-time passwords, reset, sign out everywhere, and the people list.
const db = env.DB;
let n = 0;
const addUser = async (
  role = 'viewer',
  email = `pw${++n}-${Date.now()}@example.test`,
) =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(email, await hashPassword('an-old-fake-passphrase', 1000), role)
      .run()
  ).meta.last_row_id;

describe('generatePassword', () => {
  it('makes 16 readable characters with no look-alikes, and a different one each time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(16);
      expect(p).toMatch(/^[a-zA-Z2-9]+$/);
      expect(p).not.toMatch(/[0O1lI]/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});

describe('resetPassword', () => {
  it('sets a working new password, ends their sessions, and writes an audit row without the password', async () => {
    const actor = await addUser('owner');
    const target = await addUser('manager');
    await db
      .prepare(
        "INSERT INTO session (token_hash, admin_user_id, expires_at) VALUES ('h-reset', ?, '2999-01-01T00:00:00Z')",
      )
      .bind(target)
      .run();
    expect(
      (await db
        .prepare('SELECT count(*) AS c FROM session WHERE admin_user_id = ?')
        .bind(target)
        .first<{ c: number }>())!.c,
    ).toBe(1);
    const result = await resetPassword(db, actor, target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = await db
      .prepare('SELECT password_hash FROM admin_user WHERE id = ?')
      .bind(target)
      .first<{ password_hash: string }>();
    expect(await verifyPassword(result.password, row!.password_hash)).toBe(
      true,
    );
    expect(
      await verifyPassword('an-old-fake-passphrase', row!.password_hash),
    ).toBe(false);
    expect(
      (await db
        .prepare('SELECT count(*) AS c FROM session WHERE admin_user_id = ?')
        .bind(target)
        .first<{ c: number }>())!.c,
    ).toBe(0);
    const audit = await db
      .prepare(
        "SELECT action, entity_id FROM audit_log WHERE action = 'user_password_reset' AND entity_id = ?",
      )
      .bind(target)
      .all();
    expect(audit.results).toHaveLength(1);
    expect(
      JSON.stringify(await db.prepare('SELECT * FROM audit_log').all()),
    ).not.toContain(result.password);
  });

  it('refuses your own account and an unknown one', async () => {
    const me = await addUser('owner');
    expect(await resetPassword(db, me, me)).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(await resetPassword(db, me, 99999999)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });
});

describe('signOutEverywhere', () => {
  it('ends every session of someone else, and refuses yourself and unknown people', async () => {
    const me = await addUser('owner');
    const target = await addUser('editor');
    await db
      .prepare(
        "INSERT INTO session (token_hash, admin_user_id, expires_at) VALUES ('h-out', ?, '2999-01-01T00:00:00Z')",
      )
      .bind(target)
      .run();
    expect(await signOutEverywhere(db, me, target)).toEqual({ ok: true });
    expect(
      (await db
        .prepare('SELECT count(*) AS c FROM session WHERE admin_user_id = ?')
        .bind(target)
        .first<{ c: number }>())!.c,
    ).toBe(0);
    expect(await signOutEverywhere(db, me, me)).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(await signOutEverywhere(db, me, 99999999)).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(
      (await db
        .prepare(
          "SELECT count(*) AS c FROM audit_log WHERE action = 'user_signed_out' AND entity_id = ?",
        )
        .bind(target)
        .first<{ c: number }>())!.c,
    ).toBe(1);
  });
});

describe('listUsers', () => {
  it('searches by email text literally, filters by role and status, and shows active people first', async () => {
    const tag = `find${Date.now()}`;
    const a = await addUser('manager', `${tag}.a@example.test`);
    await addUser('viewer', `${tag}.b@example.test`);
    await db
      .prepare('UPDATE admin_user SET is_active = 0 WHERE email = ?')
      .bind(`${tag}.b@example.test`)
      .run();
    const all = await listUsers(db, { q: tag });
    expect(all.map((u) => u.email)).toEqual([
      `${tag}.a@example.test`,
      `${tag}.b@example.test`,
    ]);
    expect(
      (await listUsers(db, { q: tag, role: 'manager' })).map((u) => u.id),
    ).toEqual([a]);
    expect(
      (await listUsers(db, { q: tag, status: 'inactive' })).map((u) => u.email),
    ).toEqual([`${tag}.b@example.test`]);
    // wildcards and a long search are literal and never break the query
    expect(await listUsers(db, { q: '%' })).toEqual([]);
    expect(await listUsers(db, { q: 'x'.repeat(500) })).toEqual([]);
    expect(await listUsers(db, { role: 'not-a-role' })).not.toEqual([]);
  });
});
