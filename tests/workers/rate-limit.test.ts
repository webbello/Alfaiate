import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  countHits,
  hit,
  ipBucket,
  recordHit,
  refund,
} from '../../src/modules/auth/rate-limit';

const db = env.DB;
const T0 = new Date('2026-06-01T09:00:00.000Z');
const WINDOW = 900;

describe('rate limit counters', () => {
  it('counts hits per key within a window', async () => {
    expect(await countHits(db, 'a', WINDOW, T0)).toBe(0);
    await recordHit(db, 'a', WINDOW, T0);
    await recordHit(db, 'a', WINDOW, T0);
    expect(await countHits(db, 'a', WINDOW, T0)).toBe(2);
  });

  it('keeps keys separate', async () => {
    await recordHit(db, 'x', WINDOW, T0);
    expect(await countHits(db, 'y', WINDOW, T0)).toBe(0);
  });

  it('starts a fresh count in the next window', async () => {
    await recordHit(db, 'w', WINDOW, T0);
    const later = new Date(T0.getTime() + (WINDOW + 1) * 1000);
    expect(await countHits(db, 'w', WINDOW, later)).toBe(0);
  });

  it('stores only a hash of the key, never the raw value (no IPs in the database, PRV-05)', async () => {
    await recordHit(db, 'login:ip:203.0.113.9', WINDOW, T0);
    const rows = await db
      .prepare('SELECT key_hash FROM rate_limit')
      .all<{ key_hash: string }>();
    expect(rows.results.some((r) => r.key_hash.includes('203.0.113.9'))).toBe(
      false,
    );
    expect(rows.results.every((r) => /^[0-9a-f]{64}$/.test(r.key_hash))).toBe(
      true,
    );
  });

  it('removes counters from old windows', async () => {
    await recordHit(db, 'old', WINDOW, T0);
    const much = new Date(T0.getTime() + 10 * WINDOW * 1000);
    await recordHit(db, 'new', WINDOW, much);
    const left = await db
      .prepare('SELECT count(*) AS n FROM rate_limit WHERE window_start < ?')
      .bind(Math.floor(much.getTime() / 1000) - 2 * WINDOW)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});

describe('hit (atomic)', () => {
  it('returns the new count and is race-free: parallel hits get distinct counts', async () => {
    const counts = await Promise.all(
      Array.from({ length: 10 }, () => hit(db, 'race', WINDOW, T0)),
    );
    expect([...counts].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('refund takes one back but never goes below zero', async () => {
    await hit(db, 'refund', WINDOW, T0);
    await refund(db, 'refund', WINDOW, T0);
    await refund(db, 'refund', WINDOW, T0);
    expect(await countHits(db, 'refund', WINDOW, T0)).toBe(0);
  });
});

describe('ipBucket', () => {
  it('leaves IPv4 alone', () => {
    expect(ipBucket('203.0.113.9')).toBe('203.0.113.9');
  });

  it('maps every address in one IPv6 /64 to the same bucket, and different /64s apart', () => {
    expect(ipBucket('2001:db8:abcd:12::1')).toBe(
      ipBucket('2001:db8:abcd:12:ffff:ffff:ffff:ffff'),
    );
    expect(ipBucket('2001:db8:abcd:12::1')).not.toBe(
      ipBucket('2001:db8:abcd:13::1'),
    );
  });

  it('expands :: correctly and is case-insensitive', () => {
    expect(ipBucket('2001:DB8::1')).toBe(ipBucket('2001:0db8:0:0:0:0:0:2'));
    expect(ipBucket('::1')).toBe(ipBucket('0:0:0:0:ffff::5'));
  });
});
