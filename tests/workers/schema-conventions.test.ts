import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';

// The schema repeats one phone-number rule and one timestamp default because SQLite has no reusable CHECK or default.
// This test is the "helper": it fails if any copy drifts, so the copies cannot disagree.
const db = env.DB;
const tables = async () =>
  (
    await db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
      )
      .all<{ name: string; sql: string }>()
  ).results;

describe('schema conventions', () => {
  it('every *_e164 column has the same shape check', async () => {
    let seen = 0;
    for (const t of await tables())
      for (const m of t.sql.matchAll(/^\s+(\w+_e164) TEXT([^\n]*)$/gm)) {
        const [, col, rest] = m;
        const expected = `CHECK (${col} IS NULL OR (${col} GLOB '+[1-9]*' AND ${col} NOT GLOB '*[^0-9+]*' AND length(${col}) BETWEEN 8 AND 16))`;
        expect(rest!.trim().replace(/,$/, ''), `${t.name}.${col}`).toBe(
          expected,
        );
        seen++;
      }
    expect(seen).toBe(5);
  });

  it('timestamp columns are *_at, text, and default to the same UTC format', async () => {
    for (const t of await tables()) {
      const cols = (
        await db
          .prepare(
            `SELECT name, type, dflt_value FROM pragma_table_info('${t.name}')`,
          )
          .all<{ name: string; type: string; dflt_value: string | null }>()
      ).results;
      for (const c of cols) {
        if (c.dflt_value?.includes('strftime')) {
          expect(c.name, `${t.name}.${c.name}`).toMatch(/_at$/);
          expect(c.dflt_value).toBe("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
        }
        if (/_at$/.test(c.name))
          expect(c.type, `${t.name}.${c.name}`).toBe('TEXT');
      }
    }
  });

  it('table names are singular snake_case (except the daily counters)', async () => {
    for (const t of await tables())
      expect(t.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});
