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
  const { keyHash, windowStart } = await windowFor(key, windowSeconds, now);
  await db.batch([
    db
      .prepare(
        'INSERT INTO rate_limit (key_hash, window_start, count) VALUES (?, ?, 1) ON CONFLICT (key_hash, window_start) DO UPDATE SET count = count + 1',
      )
      .bind(keyHash, windowStart),
    db
      .prepare('DELETE FROM rate_limit WHERE window_start < ?')
      .bind(windowStart - 2 * windowSeconds),
  ]);
}
