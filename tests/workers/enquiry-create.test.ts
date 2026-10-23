import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { createEnquiry } from '../../src/modules/enquiry/create';
import type { EnquiryInput, Resolved } from '../../src/modules/enquiry/schema';

const db = env.DB;
const input = (over: Partial<EnquiryInput> = {}): EnquiryInput => ({
  name: 'Fake Customer',
  phone: '+67077123456',
  channel: 'whatsapp',
  categoryId: null,
  service: 'Hem two shirts',
  areaId: null,
  areaText: 'Near the fake market',
  when: 'Saturday morning',
  notes: 'Fake notes',
  tailorSlug: null,
  ...over,
});
const choices: Resolved & { ok: true } = {
  ok: true,
  categoryId: null,
  areaId: null,
  tailorId: null,
  alsoNames: [],
  source: 'form',
};
const NOW = new Date('2026-06-01T09:00:00.000Z');
const row = (ref: string) =>
  db
    .prepare('SELECT * FROM enquiry WHERE reference_code = ?')
    .bind(ref)
    .first<Record<string, unknown>>();
const count = async () =>
  (await db
    .prepare('SELECT count(*) AS c FROM enquiry')
    .first<{ c: number }>())!.c;

describe('createEnquiry (FR-ENQ-04, PRV-03, AC-07)', () => {
  it('stores one new enquiry with consent version and time, and one status-log row', async () => {
    const r = await createEnquiry(db, {
      input: input(),
      choices,
      consentVersion: 'consent-2026-10-v1-en',
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reference).toMatch(/^AT-[A-HJ-NP-Z2-9]{8}$/);
    const e = await row(r.reference);
    expect(e).toMatchObject({
      customer_name: 'Fake Customer',
      contact_number_e164: '+67077123456',
      contact_channel: 'whatsapp',
      service_description: 'Hem two shirts',
      area_text: 'Near the fake market',
      preferred_datetime_text: 'Saturday morning',
      notes: 'Fake notes',
      status: 'new',
      is_spam: 0,
      source: 'form',
      consent_shared_with_tailor: 1,
      consent_text_version: 'consent-2026-10-v1-en',
      consent_at: '2026-06-01T09:00:00.000Z',
    });
    const log = await db
      .prepare(
        'SELECT from_status, to_status, changed_by FROM enquiry_status_log WHERE enquiry_id = ?',
      )
      .bind(e!.id)
      .all();
    expect(log.results).toEqual([
      { from_status: null, to_status: 'new', changed_by: null },
    ]);
  });

  it('records the chosen category, area and preselected tailor', async () => {
    const cat = (
      await db
        .prepare(
          "INSERT INTO garment_category (slug, name) VALUES ('ec-cat', 'EC Cat')",
        )
        .run()
    ).meta.last_row_id;
    const area = (
      await db
        .prepare(
          "INSERT INTO service_area (slug, name) VALUES ('ec-area', 'EC Area')",
        )
        .run()
    ).meta.last_row_id;
    const t = (
      await db
        .prepare(
          "INSERT INTO tailor (slug, display_name) VALUES ('ec-tailor', 'EC Tailor')",
        )
        .run()
    ).meta.last_row_id;
    const r = await createEnquiry(db, {
      input: input({ areaText: null }),
      choices: {
        ok: true,
        categoryId: cat as number,
        areaId: area as number,
        tailorId: t as number,
        alsoNames: [],
        source: 'profile:ec-tailor',
      },
      consentVersion: 'v',
      now: NOW,
    });
    if (!r.ok) throw new Error('not created');
    expect(await row(r.reference)).toMatchObject({
      garment_category_id: cat,
      area_id: area,
      preferred_tailor_id: t,
      source: 'profile:ec-tailor',
    });
  });

  it('retries on a reference collision and never creates a duplicate', async () => {
    const first = await createEnquiry(db, {
      input: input(),
      choices,
      consentVersion: 'v',
      now: NOW,
      generate: () => 'AT-COLLIDE2',
    });
    expect(first).toEqual({ ok: true, reference: 'AT-COLLIDE2' });
    const codes = ['AT-COLLIDE2', 'AT-COLLIDE2', 'AT-FRESHONE'];
    const second = await createEnquiry(db, {
      input: input(),
      choices,
      consentVersion: 'v',
      now: NOW,
      generate: () => codes.shift()!,
    });
    expect(second).toEqual({ ok: true, reference: 'AT-FRESHONE' });
    const always = await createEnquiry(db, {
      input: input(),
      choices,
      consentVersion: 'v',
      now: NOW,
      generate: () => 'AT-COLLIDE2',
    });
    expect(always).toEqual({ ok: false });
  });

  it('reports failure at once (no retry) and creates nothing when the database fails', async () => {
    const before = await count();
    let calls = 0;
    const broken = {
      prepare: () => ({ bind: () => ({}) }),
      batch: async () => {
        calls++;
        throw new Error('db down');
      },
    } as unknown as D1Database;
    expect(
      await createEnquiry(broken, {
        input: input(),
        choices,
        consentVersion: 'v',
        now: NOW,
      }),
    ).toEqual({ ok: false });
    expect(calls).toBe(1);
    expect(await count()).toBe(before);
  });

  it('leaves no enquiry behind when the status-log insert fails (one batch)', async () => {
    const before = await count();
    const real = db;
    const failing = {
      prepare: (sql: string) =>
        real.prepare(
          sql.includes('enquiry_status_log')
            ? 'INSERT INTO enquiry_status_log (nope) VALUES (1)'
            : sql,
        ),
      batch: (s: D1PreparedStatement[]) => real.batch(s),
    } as unknown as D1Database;
    expect(
      await createEnquiry(failing, {
        input: input(),
        choices,
        consentVersion: 'v',
        now: NOW,
      }),
    ).toEqual({ ok: false });
    expect(await count()).toBe(before);
  });
});

describe('enquiry code never logs customer data (SEC-05)', () => {
  const files = import.meta.glob(
    ['../../src/modules/enquiry/*.ts', '../../src/modules/notify/*.ts'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>;
  it('has console calls with constant text only', () => {
    expect(Object.keys(files).length).toBeGreaterThan(3);
    for (const [file, source] of Object.entries(files))
      for (const call of source.match(/console\.\w+\([^)]*\)/g) ?? [])
        expect(call, file).toMatch(/^console\.\w+\((['"`])[^'"`$]*\1\)$/);
  });
});
