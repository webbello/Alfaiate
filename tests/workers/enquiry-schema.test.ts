import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  parseEnquiryForm,
  resolveChoices,
} from '../../src/modules/enquiry/schema';

const db = env.DB;
let n = 0;
const valid = (over: Record<string, string> = {}) =>
  new URLSearchParams({
    name: 'Fake Customer',
    phone: '7712 3456',
    channel: 'whatsapp',
    consent: 'yes',
    ...over,
  });
const ok = (over: Record<string, string> = {}) => {
  const r = parseEnquiryForm(valid(over));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.data;
};
const errors = (over: Record<string, string>) => {
  const r = parseEnquiryForm(valid(over));
  return r.ok ? {} : r.errors;
};

describe('parseEnquiryForm (FR-ENQ-01/02/05, PRV-01)', () => {
  it('accepts the minimum: name, number, channel, consent; the rest is empty', () => {
    expect(ok()).toEqual({
      name: 'Fake Customer',
      phone: '+67077123456',
      channel: 'whatsapp',
      categoryId: null,
      service: null,
      areaId: null,
      areaText: null,
      when: null,
      notes: null,
      tailorSlug: null,
    });
  });

  it('requires a name, trimmed, at most 100 characters', () => {
    expect(errors({ name: '' }).name).toBe('required');
    expect(errors({ name: '   ' }).name).toBe('required');
    expect(errors({ name: 'x'.repeat(101) }).name).toBe('too_long');
    expect(ok({ name: '  Ana  ' }).name).toBe('Ana');
  });

  it('requires a Timor-Leste number (AD-10) and stores it normalised', () => {
    expect(errors({ phone: '' }).phone).toBe('required');
    expect(errors({ phone: '12345' }).phone).toBe('invalid');
    expect(errors({ phone: '+61 400 000 000' }).phone).toBe('invalid');
    expect(ok({ phone: '+670 7712-3456' }).phone).toBe('+67077123456');
  });

  it('requires one of the three channels', () => {
    expect(errors({ channel: '' }).channel).toBe('required');
    expect(errors({ channel: 'email' }).channel).toBe('invalid');
    for (const c of ['whatsapp', 'phone', 'either'])
      expect(ok({ channel: c }).channel).toBe(c);
  });

  it('requires the consent tick, exactly "yes"', () => {
    expect(errors({ consent: '' }).consent).toBe('required');
    expect(errors({ consent: 'no' }).consent).toBe('required');
    expect(errors({ consent: 'on' }).consent).toBe('required');
    const missing = valid();
    missing.delete('consent');
    const r = parseEnquiryForm(missing);
    expect(r.ok).toBe(false);
  });

  it('caps the optional free text and keeps hostile text as plain text', () => {
    expect(errors({ service: 'x'.repeat(201) }).service).toBe('too_long');
    expect(
      errors({ area_text: 'x'.repeat(101), area: 'other' }).area_text,
    ).toBe('too_long');
    expect(errors({ when: 'x'.repeat(101) }).when).toBe('too_long');
    expect(errors({ notes: 'x'.repeat(1001) }).notes).toBe('too_long');
    const hostile = `<script>alert(1)</script>' OR 1=1 --`;
    expect(ok({ notes: hostile }).notes).toBe(hostile);
  });

  it('reads category and area as plain ids; "other" area uses the free text, a chosen area drops it', () => {
    expect(ok({ category: '7' }).categoryId).toBe(7);
    expect(errors({ category: 'abc' }).category).toBe('invalid');
    expect(errors({ category: '7; DROP' }).category).toBe('invalid');
    expect(ok({ area: '3' }).areaId).toBe(3);
    expect(
      ok({ area: 'other', area_text: ' Behind the market ' }),
    ).toMatchObject({
      areaId: null,
      areaText: 'Behind the market',
    });
    expect(ok({ area: '3', area_text: 'ignored' })).toMatchObject({
      areaId: 3,
      areaText: null,
    });
  });

  it('keeps the typed values (not the consent) so the form can be shown again', () => {
    const r = parseEnquiryForm(valid({ name: '', notes: 'keep me' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.values.notes).toBe('keep me');
      expect(r.values.phone).toBe('7712 3456');
      expect(Object.keys(r.values)).not.toContain('consent');
    }
  });

  it('reports every failing field at once', () => {
    const r = parseEnquiryForm(new URLSearchParams());
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.errors).sort()).toEqual([
        'channel',
        'consent',
        'name',
        'phone',
      ]);
  });
});

describe('resolveChoices (active lists and a published preselected tailor)', () => {
  const category = async (active: number) =>
    (
      await db
        .prepare(
          'INSERT INTO garment_category (slug, name, is_active) VALUES (?, ?, ?)',
        )
        .bind(`eq-cat-${++n}`, `Cat ${n}`, active)
        .run()
    ).meta.last_row_id as number;
  const area = async (active: number) =>
    (
      await db
        .prepare(
          'INSERT INTO service_area (slug, name, is_active) VALUES (?, ?, ?)',
        )
        .bind(`eq-area-${++n}`, `Area ${n}`, active)
        .run()
    ).meta.last_row_id as number;
  const tailor = async (published: boolean) => {
    const slug = `eq-t-${++n}`;
    const id = (
      await db
        .prepare(
          'INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES (?, ?, ?, ?, ?, 1, ?)',
        )
        .bind(
          slug,
          `T ${n}`,
          published ? 'approved' : 'draft',
          published ? 1 : 0,
          published ? 1 : 0,
          '+67033123456',
        )
        .run()
    ).meta.last_row_id as number;
    return { slug, id };
  };

  it('accepts an active category and area', async () => {
    const c = await category(1);
    const a = await area(1);
    const r = await resolveChoices(
      db,
      ok({ category: String(c), area: String(a) }),
    );
    expect(r).toMatchObject({ ok: true, categoryId: c, areaId: a });
  });

  it('refuses an inactive or unknown category or area with a field error', async () => {
    const r = await resolveChoices(
      db,
      ok({ category: String(await category(0)), area: '999999' }),
    );
    expect(r).toEqual({
      ok: false,
      errors: { category: 'invalid', area: 'invalid' },
    });
  });

  it('preselects only a published tailor; anything else is ignored, not an error', async () => {
    const pub = await tailor(true);
    const draft = await tailor(false);
    const good = await resolveChoices(db, { ...ok(), tailorSlug: pub.slug });
    expect(good).toMatchObject({
      ok: true,
      tailorId: pub.id,
      source: `profile:${pub.slug}`,
    });
    for (const slug of [draft.slug, 'no-such-tailor', "x' OR 1=1 --", null]) {
      const r = await resolveChoices(db, { ...ok(), tailorSlug: slug });
      expect(r).toMatchObject({ ok: true, tailorId: null, source: 'form' });
    }
  });
});
