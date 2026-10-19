import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { parseJoinForm } from '../../src/modules/interest/schema';
import { createInterest } from '../../src/modules/interest/create';
import { anonymiseInterest } from '../../src/modules/interest/anonymise';
import { submitJoinForm } from '../../src/modules/interest/submit';
import { issueToken } from '../../src/modules/enquiry/spam';

// Phase 7c T7 (FR-JOIN-01..03): a tailor's interest is stored with consent and nothing else happens: no tailor, no account, nothing public.
const db = env.DB;
const SECRET = 'workers-test-form-secret-0123456789';
const form = (over: Record<string, string> = {}) =>
  new URLSearchParams({
    name: 'Fake Tailor',
    phone: '7712 3456',
    consent: 'yes',
    ...over,
  });
const count = async (table: string) =>
  (await db
    .prepare(`SELECT count(*) AS n FROM ${table}`)
    .first<{ n: number }>())!.n;
const post = async (over: Record<string, string> = {}, token?: string) =>
  new Request('https://example.test/join', {
    method: 'POST',
    body: new URLSearchParams({
      form_token:
        token ?? (await issueToken(SECRET, new Date(Date.now() - 10_000))),
      ...Object.fromEntries(form(over)),
    }),
  });
const deps = { db, secret: SECRET, lang: 'en' as const };

describe('parseJoinForm', () => {
  it('accepts a minimal valid form and normalises the number', () => {
    const r = parseJoinForm(form());
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.data).toMatchObject({
        name: 'Fake Tailor',
        phone: '+67077123456',
        business: null,
      });
  });
  it('requires a name, a valid Timor-Leste number and the consent tick', () => {
    const r = parseJoinForm(form({ name: '', phone: '123', consent: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toEqual({
        name: 'required',
        phone: 'invalid',
        consent: 'required',
      });
  });
  it('limits the free text fields', () => {
    const r = parseJoinForm(
      form({
        business: 'x'.repeat(101),
        area: 'x'.repeat(101),
        craft: 'x'.repeat(201),
        message: 'x'.repeat(501),
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toEqual({
        business: 'too_long',
        area: 'too_long',
        craft: 'too_long',
        message: 'too_long',
      });
  });
});

describe('submitting', () => {
  it('stores one record with the consent version, and creates no tailor, enquiry or admin user', async () => {
    const before = {
      t: await count('tailor'),
      e: await count('enquiry'),
      u: await count('admin_user'),
      i: await count('tailor_interest'),
    };
    const out = await submitJoinForm(
      deps,
      await post({ business: 'Fake Atelier' }),
      '198.51.100.1',
    );
    expect(out.kind).toBe('redirect');
    expect(await count('tailor_interest')).toBe(before.i + 1);
    expect(await count('tailor')).toBe(before.t);
    expect(await count('enquiry')).toBe(before.e);
    expect(await count('admin_user')).toBe(before.u);
    const row = (await db
      .prepare('SELECT * FROM tailor_interest ORDER BY id DESC LIMIT 1')
      .first<Record<string, unknown>>())!;
    expect(row.reference_code).toMatch(/^JN-[A-HJ-NP-Z2-9]{8}$/);
    expect(row.consent_text_version).toBe('consent-join-2026-10-v1-en');
    expect(row.phone_e164).toBe('+67077123456');
    if (out.kind === 'redirect')
      expect(out.to).toBe(`/join/thanks?ref=${row.reference_code}`);
  });
  it('a filled hidden field looks like success but stores nothing', async () => {
    const before = await count('tailor_interest');
    const out = await submitJoinForm(
      deps,
      await post({ extra_info: 'bot' }),
      '198.51.100.2',
    );
    expect(out.kind).toBe('redirect');
    expect(await count('tailor_interest')).toBe(before);
  });
  it('refuses a too-quick, an invalid and a consent-less submission, keeping the typed text', async () => {
    const before = await count('tailor_interest');
    const fast = await submitJoinForm(
      deps,
      await post({}, await issueToken(SECRET)),
      '198.51.100.3',
    );
    expect(fast).toMatchObject({ kind: 'form', status: 400 });
    const bad = await submitJoinForm(
      deps,
      await post({ consent: '', message: 'keep me' }),
      '198.51.100.3',
    );
    expect(bad).toMatchObject({ kind: 'form', status: 400 });
    if (bad.kind === 'form') expect(bad.view.values.message).toBe('keep me');
    const none = await submitJoinForm(
      deps,
      await post({}, 'garbage'),
      '198.51.100.3',
    );
    expect(none).toMatchObject({ kind: 'form', status: 400 });
    expect(await count('tailor_interest')).toBe(before);
  });
  it('limits one address to five tries an hour, with its own counter', async () => {
    const ip = '198.51.100.99';
    for (let i = 0; i < 5; i++)
      expect((await submitJoinForm(deps, await post({}), ip)).kind).toBe(
        'redirect',
      );
    expect(await submitJoinForm(deps, await post({}), ip)).toMatchObject({
      kind: 'message',
      status: 429,
    });
  });
  it('retries a reference collision and fails closed on any other error', async () => {
    const input = {
      name: 'A',
      business: null,
      phone: '+67077123456',
      area: null,
      craft: null,
      message: null,
    };
    const first = await createInterest(db, { input, consentVersion: 'v' });
    expect(first.ok).toBe(true);
    const codes = [first.ok ? first.reference : '', 'JN-ZZZZZZZZ'];
    const second = await createInterest(db, {
      input,
      consentVersion: 'v',
      generate: () => codes.shift()!,
    });
    expect(second).toEqual({ ok: true, reference: 'JN-ZZZZZZZZ' });
    expect(
      await createInterest(db, {
        input: { ...input, name: '' },
        consentVersion: 'v',
      }),
    ).toEqual({ ok: false });
  });
});

describe('the table', () => {
  it('refuses a live record without a name or number, and an anonymised one that still holds personal data', async () => {
    await expect(
      db
        .prepare(
          "INSERT INTO tailor_interest (reference_code, consent_contact, consent_text_version, consent_at) VALUES ('JN-CHECK001', 1, 'v', 'now')",
        )
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare(
          "INSERT INTO tailor_interest (reference_code, contact_name, consent_contact, consent_text_version, consent_at, anonymised_at) VALUES ('JN-CHECK002', 'Name', 1, 'v', 'now', 'now')",
        )
        .run(),
    ).rejects.toThrow();
  });
  it('refuses a record without consent', async () => {
    await expect(
      db
        .prepare(
          "INSERT INTO tailor_interest (reference_code, contact_name, phone_e164, consent_contact, consent_text_version, consent_at) VALUES ('JN-CHECK003', 'N', '+67077123456', 0, 'v', 'now')",
        )
        .run(),
    ).rejects.toThrow();
  });
});

describe('anonymiseInterest', () => {
  const make = async () => {
    const r = await createInterest(db, {
      input: {
        name: 'Anon Fake',
        business: 'B',
        phone: '+67077123456',
        area: 'A',
        craft: 'C',
        message: 'M',
      },
      consentVersion: 'v',
    });
    if (!r.ok) throw new Error('setup');
    const id = (await db
      .prepare('SELECT id FROM tailor_interest WHERE reference_code = ?')
      .bind(r.reference)
      .first<{ id: number }>())!.id;
    return { id, reference: r.reference };
  };
  it('needs the typed reference code, then removes every personal field and keeps reference, consent and dates, and writes an audit row', async () => {
    const { id, reference } = await make();
    const userId = (
      await db
        .prepare(
          "INSERT INTO admin_user (email, password_hash, role) VALUES ('interest-owner@example.test', 'x', 'owner')",
        )
        .run()
    ).meta.last_row_id as number;
    expect(
      await anonymiseInterest(db, { id, reference: 'JN-WRONG', userId }),
    ).toBe('wrong_reference');
    expect(await anonymiseInterest(db, { id: 999999, reference, userId })).toBe(
      'not_found',
    );
    expect(
      await anonymiseInterest(db, {
        id,
        reference: reference.toLowerCase(),
        userId,
      }),
    ).toBe('ok');
    const row = (await db
      .prepare('SELECT * FROM tailor_interest WHERE id = ?')
      .bind(id)
      .first<Record<string, unknown>>())!;
    for (const col of [
      'contact_name',
      'business_name',
      'phone_e164',
      'area_text',
      'craft_text',
      'message',
    ])
      expect(row[col], col).toBeNull();
    expect(row.reference_code).toBe(reference);
    expect(row.consent_text_version).toBe('v');
    expect(row.anonymised_at).not.toBeNull();
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM audit_log WHERE action = 'interest_anonymised' AND entity_id = ?",
        )
        .bind(id)
        .first<{ n: number }>(),
    ).toEqual({ n: 1 });
    expect(await anonymiseInterest(db, { id, reference, userId })).toBe(
      'already',
    );
  });
});
