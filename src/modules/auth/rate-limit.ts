// Fixed-window counters in D1 (Workers memory is not shared between instances). Keys are hashed, so no IPs are stored.
async function windowFor(key: string, windowSeconds: number, now: Date) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(key),
  );
  const keyHash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const windowStart =
    Math.floor(now.getTime() / 1000 / windowSeconds) * windowSeconds;
  return { keyHash, windowStart };
}

const UPSERT =
  'INSERT INTO rate_limit (key_hash, window_start, count) VALUES (?, ?, 1) ON CONFLICT (key_hash, window_start) DO UPDATE SET count = count + 1 RETURNING count';

/** Counts one attempt and returns the new count. One statement, so parallel requests get distinct counts (no check-then-act race). */
export async function hit(
  db: D1Database,
  key: string,
  windowSeconds: number,
  now = new Date(),
): Promise<number> {
  const { keyHash, windowStart } = await windowFor(key, windowSeconds, now);
  const [counted] = await db.batch<{ count: number }>([
    db.prepare(UPSERT).bind(keyHash, windowStart),
    db
      .prepare('DELETE FROM rate_limit WHERE window_start < ?')
      .bind(windowStart - 2 * windowSeconds),
  ]);
  return counted.results[0].count;
}

/** Gives back one attempt (a successful sign-in should not use up the allowance). */
export async function refund(
  db: D1Database,
  key: string,
  windowSeconds: number,
  now = new Date(),
): Promise<void> {
  const { keyHash, windowStart } = await windowFor(key, windowSeconds, now);
  await db
    .prepare(
      'UPDATE rate_limit SET count = max(count - 1, 0) WHERE key_hash = ? AND window_start = ?',
    )
    .bind(keyHash, windowStart)
    .run();
}

export async function countHits(
  db: D1Database,
  key: string,
  windowSeconds: number,
  now = new Date(),
): Promise<number> {
  const { keyHash, windowStart } = await windowFor(key, windowSeconds, now);
  const row = await db
    .prepare(
      'SELECT count FROM rate_limit WHERE key_hash = ? AND window_start = ?',
    )
    .bind(keyHash, windowStart)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function recordHit(
  db: D1Database,
  key: string,
  windowSeconds: number,
  now = new Date(),
): Promise<void> {
  await hit(db, key, windowSeconds, now);
}

/** IPv4 stays as is; an IPv6 address is reduced to its /64, because one customer controls a whole /64 and could rotate within it. */
export function ipBucket(ip: string): string {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [
        ...left,
        ...Array(Math.max(8 - left.length - right.length, 0)).fill('0'),
        ...right,
      ]
    : left;
  return `${groups
    .slice(0, 4)
    .map((g) => (parseInt(g, 16) || 0).toString(16))
    .join(':')}::/64`;
}
