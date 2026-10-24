import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  DUMMY_HASH,
  EMAIL_LIMIT,
  IP_LIMIT,
  login,
} from '../../src/modules/auth/login';
import { hashPassword, needsRehash } from '../../src/modules/auth/password';
import { revokeSession, validateSession } from '../../src/modules/auth/session';

const db = env.DB;
const T0 = new Date('2026-06-01T09:00:00.000Z');
const PASSWORD = 'a-long-fake-test-passphrase';
let n = 0;

const addUser = async (
  opts: { active?: number; iterations?: number; role?: string } = {},
) => {
  const email = `login${++n}@example.test`;
  const hash = await hashPassword(PASSWORD, opts.iterations ?? 1000);
  const id = (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role, is_active) VALUES (?, ?, ?, ?)',
      )
      .bind(email, hash, opts.role ?? 'manager', opts.active ?? 1)
      .run()
  ).meta.last_row_id;
  return { id, email };
};
let ipCounter = 0;
// Each attempt gets its own IP unless a test names one, so counters from other tests do not interfere.
const attempt = (
  email: string,
  password: string,
  ip = `198.51.100.${++ipCounter}`,
  now = T0,
  previousToken?: string,
) => login(db, { email, password, ip, previousToken }, now);

describe('login success', () => {
  it('returns a session token that validates, records last sign-in and an audit row', async () => {
    const user = await addUser();
    const result = await attempt(user.email, PASSWORD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await validateSession(db, result.token, T0)).toMatchObject({
      userId: user.id,
      role: 'manager',
    });
    const row = await db
      .prepare('SELECT last_login_at FROM admin_user WHERE id = ?')
      .bind(user.id)
      .first<{ last_login_at: string }>();
    expect(row?.last_login_at).toBe(T0.toISOString());
    const logged = await db
      .prepare(
        "SELECT admin_user_id FROM audit_log WHERE action = 'login' AND admin_user_id = ?",
      )
      .bind(user.id)
      .first();
    expect(logged).not.toBeNull();
  });

  it('ignores case and surrounding spaces in the email', async () => {
    const user = await addUser();
    expect((await attempt(`  ${user.email.toUpperCase()} `, PASSWORD)).ok).toBe(
      true,
    );
  });

  it('issues a new session on every sign-in and revokes the previous one (rotation)', async () => {
    const user = await addUser();
    const first = await attempt(user.email, PASSWORD);
    const second = await attempt(
      user.email,
      PASSWORD,
      '198.51.100.2',
      T0,
      first.ok ? first.token : undefined,
    );
    expect(first.ok && second.ok && first.token !== second.token).toBe(true);
    if (first.ok) expect(await validateSession(db, first.token, T0)).toBeNull();
  });

  it('upgrades a hash with fewer iterations than the default at sign-in', async () => {
    const user = await addUser({ iterations: 1000 });
    await attempt(user.email, PASSWORD);
    const row = await db
      .prepare('SELECT password_hash FROM admin_user WHERE id = ?')
      .bind(user.id)
      .first<{ password_hash: string }>();
    expect(row?.password_hash.split('$')[1]).toBe('600000');
    expect((await attempt(user.email, PASSWORD)).ok).toBe(true);
  });
});

describe('login failure', () => {
  it('uses a well-formed, full-strength dummy hash so unknown users cost the same time as real ones', () => {
    expect(needsRehash(DUMMY_HASH)).toBe(false);
  });

  it('gives the identical result for wrong password, unknown user, inactive user and empty password (SEC-01)', async () => {
    const active = await addUser();
    const inactive = await addUser({ active: 0 });
    const results = [
      await attempt(active.email, 'wrong-password'),
      await attempt('nobody@example.test', PASSWORD),
      await attempt(inactive.email, PASSWORD),
      await attempt(active.email, ''),
    ];
    for (const r of results) expect(r).toEqual({ ok: false, limited: false });
  });

  it('creates no session on failure and logs the failure without the email or password', async () => {
    const user = await addUser();
    await attempt(user.email, 'wrong-password');
    expect(
      await db
        .prepare('SELECT 1 FROM admin_session WHERE admin_user_id = ?')
        .bind(user.id)
        .first(),
    ).toBeNull();
    const cols = await db
      .prepare(
        "SELECT * FROM audit_log WHERE action = 'login_failed' ORDER BY id DESC LIMIT 1",
      )
      .first<Record<string, unknown>>();
    expect(JSON.stringify(cols)).not.toContain(user.email);
    expect(JSON.stringify(cols)).not.toContain('wrong-password');
  });
});

describe('login rate limit', () => {
  it('limits an IP after five failures, even for the correct password', async () => {
    const user = await addUser();
    const ip = '203.0.113.50';
    for (let i = 0; i < IP_LIMIT; i++)
      expect(await attempt(user.email, 'wrong', ip)).toEqual({
        ok: false,
        limited: false,
      });
    expect(await attempt(user.email, PASSWORD, ip)).toEqual({
      ok: false,
      limited: true,
    });
    expect(
      await db
        .prepare('SELECT 1 FROM admin_session WHERE admin_user_id = ?')
        .bind(user.id)
        .first(),
    ).toBeNull();
  });

  it('does not lock other IPs out of the same account after a few failures', async () => {
    const user = await addUser();
    for (let i = 0; i < IP_LIMIT; i++)
      await attempt(user.email, 'wrong', '203.0.113.60');
    expect((await attempt(user.email, PASSWORD, '203.0.113.61')).ok).toBe(true);
  });

  it('limits an account that is guessed from very many IPs (ceiling)', async () => {
    const user = await addUser();
    for (let i = 0; i < EMAIL_LIMIT; i++)
      await attempt(user.email, 'wrong', `192.0.2.${i + 1}`);
    expect(await attempt(user.email, PASSWORD, '192.0.2.200')).toEqual({
      ok: false,
      limited: true,
    });
  });

  it('lets the user try again after the window passes', async () => {
    const user = await addUser();
    const ip = '203.0.113.70';
    for (let i = 0; i < IP_LIMIT; i++) await attempt(user.email, 'wrong', ip);
    const later = new Date(T0.getTime() + 16 * 60_000);
    expect((await attempt(user.email, PASSWORD, ip, later)).ok).toBe(true);
  });
});

describe('revoke', () => {
  it('a revoked login token no longer validates', async () => {
    const user = await addUser();
    const r = await attempt(user.email, PASSWORD);
    if (!r.ok) throw new Error('expected sign-in');
    await revokeSession(db, r.token);
    expect(await validateSession(db, r.token, T0)).toBeNull();
  });
});

describe('login rate limit hardening', () => {
  it('lets only five of many parallel wrong guesses reach the password check', async () => {
    const user = await addUser();
    const ip = '203.0.113.150';
    const results = await Promise.all(
      Array.from({ length: 12 }, () => attempt(user.email, 'wrong', ip)),
    );
    expect(results.filter((r) => !r.ok && !r.limited)).toHaveLength(IP_LIMIT);
    expect(results.filter((r) => !r.ok && r.limited)).toHaveLength(
      12 - IP_LIMIT,
    );
  });

  it('does not let guessing from a few other addresses lock the real user out', async () => {
    const user = await addUser();
    for (let i = 0; i < 20; i++)
      await attempt(user.email, 'wrong', `192.0.2.${100 + i}`);
    expect((await attempt(user.email, PASSWORD, '198.18.0.1')).ok).toBe(true);
  });

  it('counts every address in one IPv6 /64 as the same client', async () => {
    const user = await addUser();
    for (let i = 0; i < IP_LIMIT; i++)
      await attempt(user.email, 'wrong', `2001:db8:77:88::${i + 1}`);
    expect(
      await attempt(user.email, PASSWORD, '2001:db8:77:88:aaaa::9'),
    ).toEqual({ ok: false, limited: true });
  });

  it('does not count successful sign-ins against the limit', async () => {
    const user = await addUser();
    const ip = '203.0.113.151';
    for (let i = 0; i < IP_LIMIT + 3; i++)
      expect((await attempt(user.email, PASSWORD, ip)).ok).toBe(true);
  });
});
