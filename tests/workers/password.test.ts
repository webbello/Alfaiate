import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ITERATIONS,
  configurePasswordIterations,
  dummyVerify,
  passwordIterations,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../../src/modules/auth/password';

const FAST = 1000; // keeps the suite quick; the real count is DEFAULT_ITERATIONS

describe('hashPassword / verifyPassword', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse', FAST);
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
  });

  it('handles non-ASCII passwords', async () => {
    const stored = await hashPassword('pãssword-ñ-語', FAST);
    expect(await verifyPassword('pãssword-ñ-語', stored)).toBe(true);
    expect(await verifyPassword('password-n-語', stored)).toBe(false);
  });

  it('uses a fresh salt each time', async () => {
    const a = await hashPassword('same', FAST);
    const b = await hashPassword('same', FAST);
    expect(a).not.toBe(b);
  });

  it('stores algorithm, iteration count, salt and hash, never the password', async () => {
    const stored = await hashPassword('s3cret-value', FAST);
    const [algorithm, iterations, salt, hash] = stored.split('$');
    expect(algorithm).toBe('pbkdf2-sha256');
    expect(iterations).toBe(String(FAST));
    expect(salt.length).toBeGreaterThanOrEqual(16);
    expect(hash.length).toBeGreaterThanOrEqual(32);
    expect(stored).not.toContain('s3cret-value');
  });

  it('verifies with the iteration count stored in the hash, not the current default', async () => {
    const stored = await hashPassword('old', 2000);
    expect(await verifyPassword('old', stored)).toBe(true);
  });

  it('returns false, without throwing, for tampered or malformed stored values', async () => {
    const stored = await hashPassword('pw', FAST);
    const [algorithm, iterations, salt, hash] = stored.split('$');
    const flipped = hash.slice(0, -2) + (hash.endsWith('AA') ? 'BB' : 'AA');
    const bad = [
      '',
      'not-a-hash',
      `${algorithm}$${iterations}$${salt}`,
      `${algorithm}$${iterations}$${salt}$${flipped}`,
      `md5$${iterations}$${salt}$${hash}`,
      `${algorithm}$abc$${salt}$${hash}`,
      `${algorithm}$0$${salt}$${hash}`,
      `${algorithm}$99999999999$${salt}$${hash}`,
      `${algorithm}$${iterations}$***$${hash}`,
    ];
    for (const value of bad)
      expect(await verifyPassword('pw', value)).toBe(false);
  });

  it('refuses to hash an empty password', async () => {
    await expect(hashPassword('', FAST)).rejects.toThrow();
  });

  it('flags hashes with fewer iterations than the default for rehash at next login', async () => {
    expect(needsRehash(await hashPassword('x', FAST))).toBe(true);
    expect(needsRehash(await hashPassword('x'))).toBe(false);
    expect(needsRehash('garbage')).toBe(true);
  });

  it('defaults to the OWASP-recommended 600000 iterations (AD-03, plan-dependent: see DECISIONS.md)', () => {
    expect(DEFAULT_ITERATIONS).toBe(600_000);
  });

  describe('free-plan setting (PASSWORD_ITERATIONS)', () => {
    afterEach(() => configurePasswordIterations(undefined));

    it('lowers the rounds for new hashes and flags them for upgrade once the default is restored', async () => {
      expect(configurePasswordIterations('50000')).toBe(50_000);
      const low = await hashPassword('correct horse');
      expect(low.split('$')[1]).toBe('50000');
      expect(needsRehash(low)).toBe(false);
      expect(await verifyPassword('correct horse', low)).toBe(true);
      configurePasswordIterations(undefined);
      expect(passwordIterations()).toBe(DEFAULT_ITERATIONS);
      expect(needsRehash(low)).toBe(true);
    });

    it('ignores values that are too low, too high or not numbers', () => {
      for (const bad of ['1', '19999', '600001', 'abc', '', null, undefined])
        expect(configurePasswordIterations(bad)).toBe(DEFAULT_ITERATIONS);
    });

    it('dummyVerify always fails but uses the configured rounds', async () => {
      configurePasswordIterations('20000');
      expect(await dummyVerify('anything')).toBe(false);
    });
  });
});
