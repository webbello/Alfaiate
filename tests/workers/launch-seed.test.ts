import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import rawSeed from '../../seeds/launch.sql?raw';
import { SERVICES } from '../../src/components/home/services';

const statements = rawSeed
  .split('\n')
  .filter((line) => !line.startsWith('--'))
  .join(' ')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);
const run = () => env.DB.batch(statements.map((s) => env.DB.prepare(s)));

describe('launch seed (OQ-10 starting lists)', () => {
  it('has a category for every home service card, and no placeholder marker', async () => {
    await run();
    const slugs = (
      await env.DB.prepare('SELECT slug, name FROM garment_category').all<{ slug: string; name: string }>()
    ).results;
    for (const s of SERVICES) expect(slugs.map((r) => r.slug)).toContain(s.category);
    const names = (await env.DB.prepare('SELECT name FROM service_area').all<{ name: string }>()).results;
    expect(names.length).toBe(19);
    expect([...slugs, ...names].some((r) => /placeholder/i.test(r.name))).toBe(false);
  });
  it('is safe to run twice', async () => {
    await run();
    await run();
    const n = await env.DB.prepare('SELECT count(*) AS n FROM garment_category WHERE slug = ?').bind('suits').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });
});
