import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { demoSteps } from '../../scripts/demo-lib.mjs';
import addSql from '../../seeds/demo.sql?raw';
import removeSql from '../../seeds/demo-remove.sql?raw';
import pkg from '../../package.json';

// Phase 7b T7: demo data is local-only, clearly fake, idempotent, and removes exactly what it added.
const db = env.DB;
const statements = (sql: string) =>
  sql.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('--'));
const run = async (sql: string) => {
  for (const s of statements(sql)) await db.exec(s);
};
const TABLES = [
  'tailor',
  'garment_category',
  'service_area',
  'tailor_category',
  'tailor_area',
  'enquiry',
  'enquiry_status_log',
  'referral',
  'contact_click_daily',
  'portfolio_image',
  'internal_note',
];
const counts = async () => {
  const out: Record<string, number> = {};
  for (const t of TABLES)
    out[t] = (await db
      .prepare(`SELECT count(*) AS n FROM ${t}`)
      .first<{ n: number }>())!.n;
  return out;
};
const one = async (sql: string) =>
  (await db.prepare(sql).first<{ n: number }>())!.n;

describe('the demo data files', () => {
  it('are one statement per line, so the runner and the tests execute them the same way', () => {
    for (const s of [...statements(addSql), ...statements(removeSql)])
      expect(s.trimEnd().endsWith(';')).toBe(true);
    expect(statements(addSql).length).toBeGreaterThan(10);
  });

  it('use only made-up contact numbers and a demo marker on every top-level row', () => {
    expect(addSql).not.toMatch(/\+670(?!7000)\d/);
    expect(addSql).not.toMatch(/portfolio_image|admin_user/);
    for (const s of statements(addSql).filter((l) =>
      /^INSERT INTO (tailor|enquiry|garment_category|service_area) /.test(l),
    ))
      expect(s).toMatch(/demo-|AT-DEMO|\[Demo\]/);
  });
});

describe('the runner', () => {
  it('only ever targets the local database', () => {
    for (const mode of ['add', 'remove'])
      for (const args of demoSteps(mode)) {
        expect(args).toContain('--local');
        expect(args.join(' ')).not.toMatch(/remote|--env|--preview/);
      }
  });
  it('refuses any extra option, in particular --remote, and unknown modes', () => {
    expect(() => demoSteps('add', ['--remote'])).toThrow();
    expect(() => demoSteps('remove', ['--env', 'production'])).toThrow();
    expect(() => demoSteps('wipe')).toThrow();
  });
  it('clears earlier demo rows before adding, and the package scripts call the runner', () => {
    const files = demoSteps('add').map((a) => a.at(-1));
    expect(files).toEqual([
      '--file=seeds/demo-remove.sql',
      '--file=seeds/demo.sql',
    ]);
    expect(pkg.scripts['db:demo']).toBe('node scripts/demo.mjs add');
    expect(pkg.scripts['db:demo:remove']).toBe('node scripts/demo.mjs remove');
    expect(JSON.stringify(pkg.scripts)).not.toMatch(/--remote/);
  });
});

describe('loading and removing on a scratch database', () => {
  it('adds only demo rows, twice without duplicating, and removing leaves the database as it was', async () => {
    await run(
      "INSERT INTO tailor (slug, display_name) VALUES ('real-one', 'Real One'), ('demolition-co', 'Demolition Co'), ('demo-not-ours', 'Not a demo');",
    );
    const before = await counts();
    await run(removeSql);
    await run(addSql);
    const once = await counts();
    await run(removeSql);
    await run(addSql);
    expect(await counts()).toEqual(once);
    // nothing but demo rows was added
    for (const [t, col, like] of [
      ['tailor', 'slug', 'demo-%'],
      ['garment_category', 'slug', 'demo-%'],
      ['service_area', 'slug', 'demo-%'],
      ['enquiry', 'reference_code', 'AT-DEMO%'],
    ] as const)
      expect(
        await one(
          `SELECT count(*) AS n FROM ${t} WHERE ${col} NOT LIKE '${like}'`,
        ),
      ).toBe(before[t] - (t === 'tailor' ? 1 : 0));
    expect(
      await one(
        "SELECT count(*) AS n FROM tailor WHERE slug LIKE 'demo-%' AND display_name NOT LIKE '[Demo]%' AND slug <> 'demo-not-ours'",
      ),
    ).toBe(0);
    expect(
      await one(
        "SELECT count(*) AS n FROM referral WHERE enquiry_id NOT IN (SELECT id FROM enquiry WHERE reference_code LIKE 'AT-DEMO%')",
      ),
    ).toBe(0);
    expect(
      await one(
        "SELECT count(*) AS n FROM contact_click_daily WHERE tailor_id NOT IN (SELECT id FROM tailor WHERE slug LIKE 'demo-%')",
      ),
    ).toBe(0);
    expect(once.portfolio_image).toBe(before.portfolio_image);
    expect(
      await one(
        "SELECT count(*) AS n FROM tailor WHERE slug LIKE 'demo-%' AND is_published = 1",
      ),
    ).toBeGreaterThan(0);
    expect(
      await one('SELECT count(DISTINCT status) AS n FROM enquiry'),
    ).toBeGreaterThanOrEqual(5);
    await run(removeSql);
    expect(await counts()).toEqual(before);
    expect(
      await one(
        "SELECT count(*) AS n FROM tailor WHERE slug IN ('real-one', 'demolition-co', 'demo-not-ours')",
      ),
    ).toBe(3);
  });
});
