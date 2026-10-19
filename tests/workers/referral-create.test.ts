import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { createReferral } from '../../src/modules/referral/create';
import {
  approvedTailors,
  listReferrals,
} from '../../src/modules/referral/queries';

const db = env.DB;
let n = 0;
const admin = async () =>
  (
    await db
      .prepare(
        "INSERT INTO admin_user (email, password_hash, role) VALUES (?, 'h', 'manager')",
      )
      .bind(`rc${++n}@example.test`)
      .run()
  ).meta.last_row_id as number;
const enquiry = async (
  o: { anonymised?: boolean; preferred?: number } = {},
) => {
  const ref = `AT-RC${String(++n).padStart(6, '0')}`;
  const anon = o.anonymised ? "'2026-09-01T00:00:00Z'" : 'NULL';
  const id = (
    await db
      .prepare(
        `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, preferred_tailor_id)
         VALUES (?, 'Fake Referral Person', '+67077123456', 'phone', 1, 'v', '2026-01-01T00:00:00Z', ?)`,
      )
      .bind(ref, o.preferred ?? null)
      .run()
  ).meta.last_row_id as number;
  if (o.anonymised)
    await db
      .prepare(
        `UPDATE enquiry SET customer_name = NULL, contact_number_e164 = NULL, notes = NULL, service_description = NULL, area_text = NULL, preferred_datetime_text = NULL, anonymised_at = ${anon} WHERE id = ?`,
      )
      .bind(id)
      .run();
  return id;
};
const tailor = async (status = 'approved') =>
  (
    await db
      .prepare(
        'INSERT INTO tailor (slug, display_name, status) VALUES (?, ?, ?)',
      )
      .bind(`rc-t-${++n}`, `RC Tailor ${n}`, status)
      .run()
  ).meta.last_row_id as number;
const audits = async (referralId: number) =>
  (
    await db
      .prepare(
        "SELECT * FROM audit_log WHERE entity_type = 'referral' AND entity_id = ?",
      )
      .bind(referralId)
      .all<Record<string, unknown>>()
  ).results;

describe('createReferral (FR-REF-01/02/07, AC-12, BR-08)', () => {
  it('creates a pending referral for an approved tailor and audits it with ids only', async () => {
    const who = await admin();
    const e = await enquiry();
    const t = await tailor();
    const r = await createReferral(db, {
      enquiryId: e,
      tailorId: t,
      userId: who,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await listReferrals(db, e, { withFees: false });
    expect(row).toMatchObject({
      id: r.id,
      tailor_id: t,
      tailor_response: 'pending',
      forwarded_at: null,
    });
    const [a] = await audits(r.id);
    expect(a).toMatchObject({
      admin_user_id: who,
      action: 'referral_created',
      entity_type: 'referral',
      entity_id: r.id,
    });
    expect(JSON.stringify(a)).not.toMatch(/Fake|\+670|AT-/);
  });

  it('refuses a tailor who is not approved, and unknown or malformed ids', async () => {
    const who = await admin();
    const e = await enquiry();
    for (const status of ['draft', 'archived', 'suspended'])
      expect(
        await createReferral(db, {
          enquiryId: e,
          tailorId: await tailor(status),
          userId: who,
        }),
        status,
      ).toEqual({ ok: false, error: 'not_approved' });
    expect(
      await createReferral(db, {
        enquiryId: e,
        tailorId: 999_999,
        userId: who,
      }),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(
      await createReferral(db, {
        enquiryId: 999_999,
        tailorId: await tailor(),
        userId: who,
      }),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(
      await createReferral(db, { enquiryId: 1.5, tailorId: 1, userId: who }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(await listReferrals(db, e, { withFees: false })).toEqual([]);
  });

  it('refuses an anonymised enquiry (no live data to share)', async () => {
    const who = await admin();
    const e = await enquiry({ anonymised: true });
    expect(
      await createReferral(db, {
        enquiryId: e,
        tailorId: await tailor(),
        userId: who,
      }),
    ).toEqual({ ok: false, error: 'no_consent' });
  });

  it('the database itself refuses an unapproved tailor or an anonymised enquiry even if the module is bypassed', async () => {
    const e = await enquiry();
    const unapproved = await tailor('draft');
    await expect(
      db
        .prepare('INSERT INTO referral (enquiry_id, tailor_id) VALUES (?, ?)')
        .bind(e, unapproved)
        .run(),
    ).rejects.toThrow(/approved tailor/);
    const anon = await enquiry({ anonymised: true });
    await expect(
      db
        .prepare('INSERT INTO referral (enquiry_id, tailor_id) VALUES (?, ?)')
        .bind(anon, await tailor())
        .run(),
    ).rejects.toThrow(/sharing consent/);
  });

  it('allows one active referral at a time: a second is refused while pending or accepted', async () => {
    const who = await admin();
    const e = await enquiry();
    const first = await createReferral(db, {
      enquiryId: e,
      tailorId: await tailor(),
      userId: who,
    });
    if (!first.ok) throw new Error('first');
    expect(
      await createReferral(db, {
        enquiryId: e,
        tailorId: await tailor(),
        userId: who,
      }),
    ).toEqual({ ok: false, error: 'already_active' });
    await db
      .prepare("UPDATE referral SET tailor_response = 'accepted' WHERE id = ?")
      .bind(first.id)
      .run();
    expect(
      await createReferral(db, {
        enquiryId: e,
        tailorId: await tailor(),
        userId: who,
      }),
    ).toEqual({ ok: false, error: 'already_active' });
    expect((await listReferrals(db, e, { withFees: false })).length).toBe(1);
  });

  it('allows a new referral after a decline or no response and keeps the old one (FR-REF-07)', async () => {
    const who = await admin();
    const e = await enquiry();
    const first = await createReferral(db, {
      enquiryId: e,
      tailorId: await tailor(),
      userId: who,
    });
    if (!first.ok) throw new Error('first');
    await db
      .prepare("UPDATE referral SET tailor_response = 'declined' WHERE id = ?")
      .bind(first.id)
      .run();
    const second = await createReferral(db, {
      enquiryId: e,
      tailorId: await tailor(),
      userId: who,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await db
      .prepare(
        "UPDATE referral SET tailor_response = 'no_response' WHERE id = ?",
      )
      .bind(second.id)
      .run();
    expect(
      (
        await createReferral(db, {
          enquiryId: e,
          tailorId: await tailor(),
          userId: who,
        })
      ).ok,
    ).toBe(true);
    const all = await listReferrals(db, e, { withFees: false });
    expect(all.map((r) => r.tailor_response)).toEqual([
      'declined',
      'no_response',
      'pending',
    ]);
  });

  it('two parallel creates leave exactly one active referral', async () => {
    const who = await admin();
    const e = await enquiry();
    const [t1, t2] = [await tailor(), await tailor()];
    const results = await Promise.all([
      createReferral(db, { enquiryId: e, tailorId: t1, userId: who }),
      createReferral(db, { enquiryId: e, tailorId: t2, userId: who }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await listReferrals(db, e, { withFees: false })).length).toBe(1);
  });
});

describe('listReferrals and approvedTailors', () => {
  it('returns no fee keys unless fees are asked for (managers never receive them)', async () => {
    const who = await admin();
    const e = await enquiry();
    const t = await tailor();
    const r = await createReferral(db, {
      enquiryId: e,
      tailorId: t,
      userId: who,
    });
    if (!r.ok) throw new Error('create');
    await db
      .prepare(
        "UPDATE referral SET completion_reported_at = '2026-06-01', completion_reported_by = 'tailor', fee_amount = 12345, fee_status = 'due', fee_basis_note = 'SECRET-BASIS', order_value_note = 'SECRET-ORDER' WHERE id = ?",
      )
      .bind(r.id)
      .run();
    const without = JSON.stringify(
      await listReferrals(db, e, { withFees: false }),
    );
    expect(without).not.toMatch(/fee_|12345|SECRET|order_value/);
    const [withFees] = await listReferrals(db, e, { withFees: true });
    expect(withFees).toMatchObject({
      fee_amount: 12345,
      fee_status: 'due',
      fee_basis_note: 'SECRET-BASIS',
      order_value_note: 'SECRET-ORDER',
    });
  });

  it("lists approved tailors only, the enquiry's preferred tailor first", async () => {
    const preferred = await tailor();
    await tailor('draft');
    const list = await approvedTailors(db, preferred);
    expect(list[0].id).toBe(preferred);
    expect(list.every((t) => typeof t.display_name === 'string')).toBe(true);
    const drafts = (
      await db
        .prepare("SELECT id FROM tailor WHERE status <> 'approved'")
        .all<{ id: number }>()
    ).results.map((r) => r.id);
    expect(list.some((t) => drafts.includes(t.id))).toBe(false);
  });
});
