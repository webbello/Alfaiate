import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { createReferral } from '../../src/modules/referral/create';
import { setFee } from '../../src/modules/referral/fee';
import { listReferrals } from '../../src/modules/referral/queries';

const db = env.DB;
let n = 0;
const setup = async (o: { terms?: boolean; completed?: boolean } = {}) => {
  const who = (
    await db
      .prepare(
        "INSERT INTO admin_user (email, password_hash, role) VALUES (?, 'h', 'owner')",
      )
      .bind(`rf${++n}@example.test`)
      .run()
  ).meta.last_row_id as number;
  const e = (
    await db
      .prepare(
        "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at) VALUES (?, 'Fake Fee Person', '+67077123456', 'phone', 1, 'v', '2026-01-01T00:00:00Z')",
      )
      .bind(`AT-RF${String(++n).padStart(6, '0')}`)
      .run()
  ).meta.last_row_id as number;
  const t = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status, fee_terms_agreed_on) VALUES (?, ?, 'approved', ?)",
      )
      .bind(
        `rf-t-${++n}`,
        `RF Tailor ${n}`,
        o.terms === false ? null : '2026-05-01',
      )
      .run()
  ).meta.last_row_id as number;
  const r = await createReferral(db, {
    enquiryId: e,
    tailorId: t,
    userId: who,
  });
  if (!r.ok) throw new Error('setup');
  if (o.completed !== false)
    await db
      .prepare(
        "UPDATE referral SET completion_reported_at = '2026-06-01', completion_reported_by = 'tailor' WHERE id = ?",
      )
      .bind(r.id)
      .run();
  return { who, e, id: r.id };
};
const form = (over: Record<string, string> = {}) => ({
  fee_amount: '',
  fee_basis_note: '',
  order_value_note: '',
  fee_status: 'not_due',
  fee_paid_at: '',
  ...over,
});
const run = (
  s: Awaited<ReturnType<typeof setup>>,
  input: Record<string, string>,
  role = 'owner',
) =>
  setFee(db, { enquiryId: s.e, referralId: s.id, userId: s.who, role, input });
const get = async (e: number) =>
  (await listReferrals(db, e, { withFees: true }))[0];
const audits = async (id: number) =>
  (
    await db
      .prepare(
        "SELECT * FROM audit_log WHERE entity_type = 'referral' AND entity_id = ? AND action = 'referral_fee_updated'",
      )
      .bind(id)
      .all<Record<string, unknown>>()
  ).results;

describe('setFee (FR-REF-06, BR-09, BR-10, AC-13)', () => {
  it('stores dollars as cents with the basis, order note, status and paid date', async () => {
    const s = await setup();
    expect(
      await run(
        s,
        form({
          fee_amount: '25.5',
          fee_basis_note: 'agreed 10 percent',
          order_value_note: 'about $255',
          fee_status: 'paid',
          fee_paid_at: '2026-06-20',
        }),
      ),
    ).toEqual({ ok: true });
    expect(await get(s.e)).toMatchObject({
      fee_amount: 2550,
      fee_basis_note: 'agreed 10 percent',
      order_value_note: 'about $255',
      fee_status: 'paid',
      fee_paid_at: '2026-06-20',
    });
  });

  it('is for the owner only', async () => {
    const s = await setup();
    for (const role of ['manager', 'editor', 'viewer'])
      expect(
        await run(s, form({ fee_amount: '10', fee_status: 'due' }), role),
        role,
      ).toEqual({ ok: false, error: 'forbidden' });
    expect((await get(s.e)).fee_amount).toBeNull();
  });

  it('needs a reported completion before any amount (BR-10)', async () => {
    const s = await setup({ completed: false });
    expect(await run(s, form({ fee_amount: '10', fee_status: 'due' }))).toEqual(
      { ok: false, error: 'needs_completion' },
    );
    expect((await run(s, form({ fee_status: 'not_due' }))).ok).toBe(true);
    expect((await run(s, form({ fee_status: 'waived' }))).ok).toBe(true);
  });

  it('needs a paid date for "paid", and ignores a paid date for any other status', async () => {
    const s = await setup();
    expect(
      await run(s, form({ fee_amount: '10', fee_status: 'paid' })),
    ).toEqual({ ok: false, error: 'needs_paid_date' });
    await run(
      s,
      form({ fee_amount: '10', fee_status: 'due', fee_paid_at: '2026-06-20' }),
    );
    expect((await get(s.e)).fee_paid_at).toBeNull();
  });

  it("needs the tailor's agreed terms before a fee is due or paid (BR-09)", async () => {
    const s = await setup({ terms: false });
    expect(await run(s, form({ fee_amount: '10', fee_status: 'due' }))).toEqual(
      { ok: false, error: 'no_agreed_terms' },
    );
    expect(
      await run(
        s,
        form({
          fee_amount: '10',
          fee_status: 'paid',
          fee_paid_at: '2026-06-20',
        }),
      ),
    ).toEqual({ ok: false, error: 'no_agreed_terms' });
    for (const status of ['not_due', 'waived', 'disputed'])
      expect((await run(s, form({ fee_status: status }))).ok, status).toBe(
        true,
      );
  });

  it('refuses malformed amounts, dates, statuses and long notes, and changes nothing', async () => {
    const s = await setup();
    for (const bad of <Record<string, string>[]>[
      { fee_amount: '-5' },
      { fee_amount: '1.234' },
      { fee_amount: 'ten' },
      { fee_amount: '1e3' },
      { fee_amount: '10000000' },
      { fee_status: 'owed' },
      { fee_status: 'paid', fee_paid_at: '2026-02-30' },
      { fee_basis_note: 'x'.repeat(301) },
      { order_value_note: 'x'.repeat(301) },
    ])
      expect(await run(s, form(bad)), JSON.stringify(bad)).toEqual({
        ok: false,
        error: 'invalid',
      });
    expect(await audits(s.id)).toHaveLength(0);
    expect((await get(s.e)).fee_amount).toBeNull();
  });

  it('accepts an amount of exactly one million dollars and refuses more', async () => {
    const s = await setup();
    expect(
      (await run(s, form({ fee_amount: '1000000', fee_status: 'due' }))).ok,
    ).toBe(true);
    expect(
      await run(s, form({ fee_amount: '1000000.01', fee_status: 'due' })),
    ).toEqual({ ok: false, error: 'invalid' });
  });

  it('refuses a referral of another enquiry or a missing one', async () => {
    const a = await setup();
    const b = await setup();
    expect(
      await setFee(db, {
        enquiryId: b.e,
        referralId: a.id,
        userId: a.who,
        role: 'owner',
        input: form(),
      }),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(
      await setFee(db, {
        enquiryId: a.e,
        referralId: 999_999,
        userId: a.who,
        role: 'owner',
        input: form(),
      }),
    ).toEqual({ ok: false, error: 'not_found' });
  });

  it('audits with ids only and never computes or defaults an amount', async () => {
    const s = await setup();
    await run(
      s,
      form({
        fee_amount: '99.99',
        fee_basis_note: 'SECRET-BASIS',
        fee_status: 'due',
      }),
    );
    const rows = await audits(s.id);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/9999|99\.99|SECRET|Fake/);
    const other = await setup();
    await run(other, form({ fee_status: 'due' }));
    expect((await get(other.e)).fee_amount).toBeNull(); // no default, no suggestion
  });
});

describe('setFee when the record changes between the checks and the write', () => {
  it('returns a plain refusal instead of failing, and keeps BR-09 and BR-10 intact', async () => {
    const real = db;
    const racing = (undo: string) =>
      ({
        prepare: (sql: string) => real.prepare(sql),
        batch: async (statements: D1PreparedStatement[]) => {
          await real.prepare(undo).run();
          return real.batch(statements);
        },
      }) as unknown as D1Database;
    const a = await setup();
    const lostCompletion = await setFee(
      racing(
        `UPDATE referral SET completion_reported_at = NULL, completion_reported_by = NULL WHERE id = ${a.id}`,
      ),
      {
        enquiryId: a.e,
        referralId: a.id,
        userId: a.who,
        role: 'owner',
        input: form({ fee_amount: '10', fee_status: 'not_due' }),
      },
    );
    expect(lostCompletion).toEqual({ ok: false, error: 'needs_completion' });
    expect((await get(a.e)).fee_amount).toBeNull();
    const b = await setup();
    const lostTerms = await setFee(
      racing(
        `UPDATE tailor SET fee_terms_agreed_on = NULL WHERE id = (SELECT tailor_id FROM referral WHERE id = ${b.id})`,
      ),
      {
        enquiryId: b.e,
        referralId: b.id,
        userId: b.who,
        role: 'owner',
        input: form({ fee_amount: '10', fee_status: 'due' }),
      },
    );
    expect(lostTerms).toEqual({ ok: false, error: 'no_agreed_terms' });
    expect((await get(b.e)).fee_status).toBe('not_due');
  });
});
