import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { countHits, recordHit } from '../../src/modules/auth/rate-limit';

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
