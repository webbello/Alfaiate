import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  buildCreateSql,
  buildResetSql,
  validateEmail,
  validatePassword,
} from '../../scripts/owner-lib.mjs';
import { hashPassword } from '../../src/modules/auth/password';
import { login } from '../../src/modules/auth/login';
import { createSession } from '../../src/modules/auth/session';

const db = env.DB;
const PASSWORD = 'a-long-fake-test-passphrase';
// D1 exec() takes one statement per line, which is also how the builders emit them.
const run = (sql: string) => db.exec(sql);

describe('validation', () => {
  it('accepts a normal email and normalises it', () => {
    expect(validateEmail('  Owner@Example.test ')).toBe('owner@example.test');
  });

  it('rejects emails that are malformed or could break out of a SQL string', () => {
    for (const bad of [
      '',
      'no-at-sign',
      "a'b@example.test",
      'a b@example.test',
      'a@b',
      'a@example.test; DROP TABLE admin_user',
      '--@example.test',
    ]) {
      expect(() => validateEmail(bad), bad).toThrow();
    }
  });

  it('requires a password of at least 12 characters', () => {
    expect(() => validatePassword('short')).toThrow();
    expect(validatePassword(PASSWORD)).toBe(PASSWORD);
  });
});

describe('buildCreateSql', () => {
  it('inserts an active owner whose hash verifies and who can sign in', async () => {
    await db.prepare('DELETE FROM admin_user').run();
    const hash = await hashPassword(PASSWORD, 1000);
    await run(buildCreateSql('first.owner@example.test', hash));
    const row = await db
      .prepare(
        "SELECT role, is_active FROM admin_user WHERE email = 'first.owner@example.test'",
      )
      .first();
    expect(row).toEqual({ role: 'owner', is_active: 1 });
    const result = await login(db, {
      email: 'first.owner@example.test',
      password: PASSWORD,
      ip: '203.0.113.200',
    });
    expect(result.ok).toBe(true);
  });

  it('writes an audit row that names no email or password', async () => {
    const rows = await db
      .prepare(
        "SELECT * FROM audit_log WHERE action = 'user_created' ORDER BY id DESC LIMIT 1",
      )
      .first();
    expect(JSON.stringify(rows)).not.toContain('first.owner');
  });

  it('inserts nothing, and audits nothing, when an active owner already exists (use the admin UI instead)', async () => {
    const before = (await db
      .prepare('SELECT count(*) AS c FROM audit_log')
      .first<{ c: number }>())!.c;
    await run(
      buildCreateSql('second@example.test', await hashPassword(PASSWORD, 1000)),
    );
    expect(
      await db
        .prepare("SELECT 1 FROM admin_user WHERE email = 'second@example.test'")
        .first(),
    ).toBeNull();
    expect(
      (await db
        .prepare('SELECT count(*) AS c FROM audit_log')
        .first<{ c: number }>())!.c,
    ).toBe(before);
  });
});

describe('buildResetSql', () => {
  it('replaces the hash, ends every session and audits it', async () => {
    const id = (await db
      .prepare(
        "SELECT id FROM admin_user WHERE email = 'first.owner@example.test'",
      )
      .first<{ id: number }>())!.id;
    await createSession(db, id);
    const hash = await hashPassword('a-completely-new-passphrase', 1000);
    await run(buildResetSql('first.owner@example.test', hash));
    const row = await db
      .prepare('SELECT password_hash FROM admin_user WHERE id = ?')
      .bind(id)
      .first<{ password_hash: string }>();
    expect(row?.password_hash).toBe(hash);
    expect(
      await db
        .prepare('SELECT 1 FROM session WHERE admin_user_id = ?')
        .bind(id)
        .first(),
    ).toBeNull();
    expect(
      await db
        .prepare(
          "SELECT 1 FROM audit_log WHERE action = 'password_changed' AND admin_user_id = ?",
        )
        .bind(id)
        .first(),
    ).not.toBeNull();
  });

  it('does nothing for an unknown email', async () => {
    await run(
      buildResetSql('ghost@example.test', await hashPassword(PASSWORD, 1000)),
    );
    expect(
      await db
        .prepare("SELECT 1 FROM admin_user WHERE email = 'ghost@example.test'")
        .first(),
    ).toBeNull();
  });
});
