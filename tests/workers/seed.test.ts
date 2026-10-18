import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import rawSeed from '../../seeds/placeholders.sql?raw';

// D1 exec() takes one statement per line and no comments; wrangler handles the full file.
const seedSql = rawSeed
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('--'))
  .join('\n');

describe('placeholder seed (OQ-10 pending)', () => {
  it('inserts categories and areas that are all visibly marked as placeholders', async () => {
    await env.DB.exec(seedSql);
    const rows = await env.DB.prepare(
      'SELECT name FROM garment_category UNION ALL SELECT name FROM service_area',
    ).all<{ name: string }>();
    expect(rows.results.length).toBeGreaterThanOrEqual(6);
    expect(rows.results.every((r) => r.name.startsWith('[Placeholder] '))).toBe(
      true,
    );
  });

  it('is safe to run twice', async () => {
    await env.DB.exec(seedSql);
    await env.DB.exec(seedSql);
    const n = await env.DB.prepare(
      'SELECT count(*) AS n FROM garment_category',
    ).first<{ n: number }>();
    expect(n?.n).toBe(4);
  });

  it('is not part of migrations, so production never receives it', async () => {
    const migrationNames = env.TEST_MIGRATIONS.map((m) => m.name);
    expect(migrationNames.some((name) => /seed|placeholder/i.test(name))).toBe(
      false,
    );
  });
});
