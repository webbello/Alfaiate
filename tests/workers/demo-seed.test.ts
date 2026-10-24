import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { demoSteps } from '../../scripts/demo-lib.mjs';
import addSql from '../../seeds/demo.sql?raw';
import removeSql from '../../seeds/demo-remove.sql?raw';
import launchSql from '../../seeds/launch.sql?raw';
import pkg from '../../package.json';

// Phase 7b T7: demo data is local-only, clearly fake, idempotent, and removes exactly what it added.
const db = env.DB;
const statements = (sql: string) =>
  sql.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('--'));
const run = async (sql: string) => {
  for (const s of statements(sql)) await db.exec(s);
};
// the launch lists are written over several lines; D1 wants one statement per line
const runLaunch = async () => {
  for (const s of launchSql
    .split('\n')
    .filter((l) => !l.startsWith('--'))
    .join(' ')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean))
    await db.exec(`${s};`);
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
  'tailor_interest',
  'tailor_account',
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
    expect(statements(addSql).length).toBeGreaterThan(100);
  });

  it('use only made-up contact numbers, no photos, and the +6707000 marker on every person-level row', () => {
    expect(addSql).not.toMatch(/\+670(?!7000)\d/);
    expect(addSql).not.toMatch(/portfolio_image/);
    for (const s of statements(addSql).filter((l) =>
      /^INSERT INTO (tailor|enquiry|tailor_interest) /.test(l),
    ))
      expect(s).toContain('+6707000');
    expect(addSql).not.toMatch(/\[Demo\]|Made-up|Demo Customer/);
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
      '--file=seeds/launch.sql',
      '--file=seeds/demo.sql',
    ]);
    expect(pkg.scripts['db:demo']).toBe('node scripts/demo.mjs add');
    expect(pkg.scripts['db:demo:remove']).toBe('node scripts/demo.mjs remove');
    expect(JSON.stringify(pkg.scripts)).not.toMatch(/--remote/);
  });
});

describe('loading and removing on a scratch database', () => {
  it('adds only demo rows, twice without duplicating, covers every state, and removing leaves the database as it was', async () => {
    await runLaunch();
    await run(
      "INSERT INTO tailor (slug, display_name, whatsapp_e164) VALUES ('real-one', 'Real One', '+67077123456'), ('demolition-co', 'Demolition Co', NULL), ('demo-not-ours', 'Not a demo', NULL);",
    );
    // real-looking rows that share the made-up number prefix but not the demo markers must survive the removal
    await run(
      "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, source) VALUES ('AT-REAL0001', 'Real Person', '+67070009999', 'phone', 1, 'v1', '2026-01-01T00:00:00Z', 'form');",
    );
    await run(
      "INSERT INTO tailor_interest (reference_code, contact_name, phone_e164, consent_contact, consent_text_version, consent_at) VALUES ('JN-REAL0001', 'Real Applicant', '+67070009998', 1, 'v1', '2026-01-01T00:00:00Z');",
    );
    await run(
      "INSERT INTO tailor (slug, display_name, private_phone) VALUES ('real-lookalike', 'Real Lookalike', '+67070009997');",
    );
    const before = await counts();
    await run(removeSql);
    await run(addSql);
    const once = await counts();
    await run(removeSql);
    await run(addSql);
    expect(await counts()).toEqual(once);
    // nothing but demo rows was added to the person-level tables
    expect(
      await one(
        "SELECT count(*) AS n FROM enquiry WHERE consent_text_version <> 'consent-demo'",
      ),
    ).toBe(before.enquiry);
    expect(
      await one(
        "SELECT count(*) AS n FROM tailor_interest WHERE consent_text_version <> 'join-consent-demo'",
      ),
    ).toBe(before.tailor_interest);
    expect(
      await one(
        "SELECT count(*) AS n FROM tailor WHERE slug IN ('real-lookalike','real-one','demolition-co','demo-not-ours')",
      ),
    ).toBe(4);
    expect(once.garment_category).toBe(before.garment_category);
    expect(once.portfolio_image).toBe(before.portfolio_image);
    // every state the owner has to learn is present
    const has = async (sql: string) =>
      expect(await one(sql), sql).toBeGreaterThan(0);
    await has('SELECT count(*) AS n FROM tailor WHERE is_published = 1');
    await has(
      "SELECT count(*) AS n FROM tailor WHERE status = 'approved' AND is_published = 0 AND permission_recorded = 1",
    );
    await has("SELECT count(*) AS n FROM tailor WHERE status = 'draft'");
    await has("SELECT count(*) AS n FROM tailor WHERE status = 'suspended'");
    await has('SELECT count(*) AS n FROM tailor_account WHERE email IS NULL');
    await has(
      'SELECT count(*) AS n FROM tailor_account WHERE review_requested_at IS NOT NULL',
    );
    for (const d of ['pending', 'approved', 'declined'])
      await has(
        `SELECT count(*) AS n FROM tailor_interest WHERE decision = '${d}'`,
      );
    expect(await one('SELECT count(DISTINCT status) AS n FROM enquiry')).toBe(
      7,
    );
    await has('SELECT count(*) AS n FROM enquiry WHERE is_spam = 1');
    for (const r of ['pending', 'accepted', 'declined', 'no_response'])
      await has(
        `SELECT count(*) AS n FROM referral WHERE tailor_response = '${r}'`,
      );
    for (const f of ['due', 'paid', 'waived', 'disputed'])
      await has(`SELECT count(*) AS n FROM referral WHERE fee_status = '${f}'`);
    // a join request that was approved points at its tailor
    expect(
      await one(
        "SELECT count(*) AS n FROM tailor_interest i JOIN tailor t ON t.id = i.tailor_id WHERE i.decision = 'approved'",
      ),
    ).toBe(3);
    await run(removeSql);
    expect(await counts()).toEqual(before);
    expect(
      await one(
        "SELECT count(*) AS n FROM enquiry WHERE reference_code = 'AT-REAL0001'",
      ),
    ).toBe(1);
    expect(
      await one(
        "SELECT count(*) AS n FROM tailor WHERE slug IN ('real-one', 'demolition-co', 'demo-not-ours')",
      ),
    ).toBe(3);
  });
});
