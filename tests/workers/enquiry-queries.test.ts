import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  LIST_CAP,
  STATUSES,
  countByStatus,
  listEnquiries,
} from '../../src/modules/enquiry/queries';

const db = env.DB;
let n = 0;
const add = async (
  o: {
    name?: string;
    phone?: string;
    status?: string;
    spam?: boolean;
    at?: string;
    ref?: string;
  } = {},
) => {
  const ref = o.ref ?? `AT-Q${String(++n).padStart(7, '0')}`;
  await db
    .prepare(
      `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status, is_spam, created_at)
       VALUES (?, ?, ?, 'phone', 1, 'v', '2026-01-01T00:00:00Z', ?, ?, ?)`,
    )
    .bind(
      ref,
      o.name ?? `Fake Person ${n}`,
      o.phone ?? '+67077123456',
      o.status ?? 'new',
      o.spam ? 1 : 0,
      o.at ?? '2026-06-01T09:00:00.000Z',
    )
    .run();
  return ref;
};
const refs = async (filters: Parameters<typeof listEnquiries>[1] = {}) =>
  (await listEnquiries(db, filters)).rows.map((r) => r.reference_code);

describe('listEnquiries (FR-ADM-06)', () => {
  it('lists newest first and hides spam unless asked', async () => {
    const old = await add({
      status: 'contacted',
      at: '2026-01-01T00:00:00.000Z',
    });
    const recent = await add({
      status: 'contacted',
      at: '2026-07-01T00:00:00.000Z',
    });
    const spam = await add({ spam: true, at: '2026-08-01T00:00:00.000Z' });
    const shown = await refs();
    expect(shown.indexOf(recent)).toBeLessThan(shown.indexOf(old));
    expect(shown).not.toContain(spam);
    expect(await refs({ spam: true })).toContain(spam);
  });

  it('filters by status, and ignores an unknown status', async () => {
    const contacted = await add({ status: 'contacted' });
    const fresh = await add({ status: 'new' });
    expect(await refs({ status: 'contacted' })).toContain(contacted);
    expect(await refs({ status: 'contacted' })).not.toContain(fresh);
    expect(STATUSES).toEqual([
      'new',
      'contacted',
      'referred',
      'accepted_by_tailor',
      'completed_reported',
      'not_converted',
      'cancelled',
    ]);
    expect(await refs({ status: 'bogus' })).toContain(fresh);
  });

  it('searches by reference, name (any case) and phone (any written form)', async () => {
    const a = await add({
      name: 'Marcia Searchable',
      phone: '+67073334444',
      ref: 'AT-SEARCH22',
    });
    await add({ name: 'Someone Else', phone: '+67075556666' });
    expect(await refs({ q: 'search22' })).toEqual([a]);
    expect(await refs({ q: 'MARCIA' })).toEqual([a]);
    expect(await refs({ q: '7333 4444' })).toEqual([a]);
    expect(await refs({ q: '+670 7333-4444' })).toEqual([a]);
    expect(await refs({ q: 'nobody-by-this-name' })).toEqual([]);
  });

  it('treats % and _ and quotes in the search as plain text', async () => {
    await add({ name: 'Plain Name' });
    expect(await refs({ q: '%' })).toEqual([]);
    expect(await refs({ q: '_' })).toEqual([]);
    expect(await refs({ q: "x' OR 1=1 --" })).toEqual([]);
    expect(await refs({ q: 'x'.repeat(500) })).toEqual([]);
    for (const q of ['%'.repeat(60), '😀'.repeat(40), '\\'.repeat(60)])
      expect(await refs({ q })).toEqual([]);
  });

  it('caps the list and says when it was cut', async () => {
    for (let i = 0; i < LIST_CAP + 5; i++) await add({ name: 'Cap Person' });
    const result = await listEnquiries(db, { q: 'Cap Person' });
    expect(result.rows).toHaveLength(LIST_CAP);
    expect(result.truncated).toBe(true);
    expect((await listEnquiries(db, { q: 'Marcia' })).truncated).toBe(false);
  });

  it('lists an anonymised enquiry without a name or number', async () => {
    const ref = await add({ ref: 'AT-ANON2222' });
    await db
      .prepare(
        "UPDATE enquiry SET customer_name = NULL, contact_number_e164 = NULL, notes = NULL, anonymised_at = '2026-09-01T00:00:00Z' WHERE reference_code = ?",
      )
      .bind(ref)
      .run();
    const row = (await listEnquiries(db, { q: 'AT-ANON2222' })).rows[0];
    expect(row).toMatchObject({
      reference_code: ref,
      customer_name: null,
      contact_number_e164: null,
    });
  });
});

describe('inbox order and referral state (Phase 7b T4)', () => {
  const referral = async (
    ref: string,
    response: string,
    tailorName = 'Inbox Tailor',
  ) => {
    const e = (await db
      .prepare('SELECT id FROM enquiry WHERE reference_code = ?')
      .bind(ref)
      .first<{ id: number }>())!.id;
    const t = (
      await db
        .prepare(
          "INSERT INTO tailor (slug, display_name, status) VALUES (?, ?, 'approved')",
        )
        .bind(`iq-${++n}`, tailorName)
        .run()
    ).meta.last_row_id;
    await db
      .prepare(
        'INSERT INTO referral (enquiry_id, tailor_id, tailor_response) VALUES (?, ?, ?)',
      )
      .bind(e, t, response)
      .run();
  };

  it('lists new enquiries first and oldest first (FR-ADM-12), then the others newest first', async () => {
    const oldNew = await add({ status: 'new', at: '2030-01-01T00:00:00.000Z' });
    const recentContacted = await add({
      status: 'contacted',
      at: '2030-03-03T00:00:00.000Z',
    });
    const recentNew = await add({
      status: 'new',
      at: '2030-02-02T00:00:00.000Z',
    });
    const oldContacted = await add({
      status: 'contacted',
      at: '2030-01-02T00:00:00.000Z',
    });
    const order = (await refs({ q: 'Fake Person' })).filter((r) =>
      [oldNew, recentContacted, recentNew, oldContacted].includes(r),
    );
    expect(order).toEqual([oldNew, recentNew, recentContacted, oldContacted]);
  });

  it('shows the referral state: the active one if there is one, otherwise the latest outcome, otherwise none', async () => {
    const none = await add();
    const pending = await add();
    const declinedThenAccepted = await add();
    const declinedOnly = await add();
    await referral(pending, 'pending');
    await referral(declinedThenAccepted, 'declined');
    await referral(declinedThenAccepted, 'accepted');
    await referral(declinedOnly, 'no_response');
    const state = async (ref: string) =>
      (await listEnquiries(db, { q: ref })).rows[0].referral_state;
    expect(await state(none)).toBeNull();
    expect(await state(pending)).toBe('pending');
    expect(await state(declinedThenAccepted)).toBe('accepted');
    expect(await state(declinedOnly)).toBe('no_response');
  });

  it('counts enquiries per status, leaving spam out, and gives the total', async () => {
    const before = await countByStatus(db);
    await add({ status: 'contacted' });
    await add({ status: 'contacted' });
    await add({ status: 'cancelled' });
    await add({ status: 'contacted', spam: true });
    const after = await countByStatus(db);
    expect(after.byStatus.contacted - before.byStatus.contacted).toBe(2);
    expect(after.byStatus.cancelled - before.byStatus.cancelled).toBe(1);
    expect(after.total - before.total).toBe(3);
    expect(Object.keys(after.byStatus).sort()).toEqual([...STATUSES].sort());
    expect(after.total).toBe(
      Object.values(after.byStatus).reduce((a, b) => a + b, 0),
    );
  });
});
