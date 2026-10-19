import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { createReferral } from '../../src/modules/referral/create';
import { updateReferral } from '../../src/modules/referral/update';
import { listReferrals } from '../../src/modules/referral/queries';

const db = env.DB;
let n = 0;
const admin = async () =>
  (
    await db
      .prepare(
        "INSERT INTO admin_user (email, password_hash, role) VALUES (?, 'h', 'manager')",
      )
      .bind(`ru${++n}@example.test`)
      .run()
  ).meta.last_row_id as number;
const setup = async () => {
  const who = await admin();
  const e = (
    await db
      .prepare(
        "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at) VALUES (?, 'Fake Update Person', '+67077123456', 'phone', 1, 'v', '2026-01-01T00:00:00Z')",
      )
      .bind(`AT-RU${String(++n).padStart(6, '0')}`)
      .run()
  ).meta.last_row_id as number;
  const t = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status) VALUES (?, ?, 'approved')",
      )
      .bind(`ru-t-${++n}`, `RU Tailor ${n}`)
      .run()
  ).meta.last_row_id as number;
  const r = await createReferral(db, {
    enquiryId: e,
    tailorId: t,
    userId: who,
  });
  if (!r.ok) throw new Error('setup');
  return { who, e, id: r.id };
};
const NOW = new Date('2026-06-10T01:00:00Z'); // 10:00 on 10 June in Dili
const form = (over: Record<string, string> = {}) => ({
  forwarded_at: '',
  forwarded_via: '',
  fields_shared_note: '',
  tailor_response: 'pending',
  responded_at: '',
  completion_reported_at: '',
  completion_reported_by: '',
  closed_reason: '',
  ...over,
});
const get = async (e: number) =>
  (await listReferrals(db, e, { withFees: true }))[0];
const audits = async (id: number) =>
  (
    await db
      .prepare(
        "SELECT * FROM audit_log WHERE entity_type = 'referral' AND entity_id = ? AND action = 'referral_updated'",
      )
      .bind(id)
      .all<Record<string, unknown>>()
  ).results;
const run = (
  s: Awaited<ReturnType<typeof setup>>,
  input: Record<string, string>,
  role = 'manager',
) =>
  updateReferral(db, {
    enquiryId: s.e,
    referralId: s.id,
    userId: s.who,
    role,
    input,
    now: NOW,
  });

describe('updateReferral: forwarding, response, completion (FR-REF-03/04/05, AC-13, BR-10)', () => {
  it('records the forwarded date, method and what was shared', async () => {
    const s = await setup();
    expect(
      await run(
        s,
        form({
          forwarded_at: '2026-06-09',
          forwarded_via: 'whatsapp',
          fields_shared_note: 'name, number, area',
        }),
      ),
    ).toEqual({ ok: true });
    expect(await get(s.e)).toMatchObject({
      forwarded_at: '2026-06-09',
      forwarded_via: 'whatsapp',
      fields_shared_note: 'name, number, area',
    });
  });

  it('accepts every method and response, and refuses unknown ones', async () => {
    const s = await setup();
    for (const via of ['whatsapp', 'phone', 'sms', 'in_person', 'other', ''])
      expect((await run(s, form({ forwarded_via: via }))).ok, via).toBe(true);
    for (const r of ['pending', 'accepted', 'declined', 'no_response'])
      expect((await run(s, form({ tailor_response: r }))).ok, r).toBe(true);
    expect(await run(s, form({ forwarded_via: 'telegram' }))).toMatchObject({
      ok: false,
      error: 'invalid',
    });
    expect(await run(s, form({ tailor_response: 'maybe' }))).toMatchObject({
      ok: false,
      error: 'invalid',
    });
  });

  it("uses today's Dili date when a response has no date, and keeps a typed one; pending has none", async () => {
    const s = await setup();
    await run(s, form({ tailor_response: 'accepted' }));
    expect((await get(s.e)).responded_at).toBe('2026-06-10');
    await run(
      s,
      form({ tailor_response: 'declined', responded_at: '2026-06-08' }),
    );
    expect((await get(s.e)).responded_at).toBe('2026-06-08');
    await run(
      s,
      form({ tailor_response: 'pending', responded_at: '2026-06-08' }),
    );
    expect((await get(s.e)).responded_at).toBeNull();
  });

  it('refuses bad dates and over-long text, and changes nothing', async () => {
    const s = await setup();
    for (const bad of <Record<string, string>[]>[
      { forwarded_at: '2026-02-30' },
      { forwarded_at: 'yesterday' },
      { responded_at: '2026-6-1', tailor_response: 'accepted' },
      {
        completion_reported_at: '31/12/2026',
        completion_reported_by: 'tailor',
      },
      { fields_shared_note: 'x'.repeat(501) },
      { closed_reason: 'x'.repeat(301) },
    ])
      expect(await run(s, form(bad)), JSON.stringify(bad)).toMatchObject({
        ok: false,
        error: 'invalid',
      });
    expect(await audits(s.id)).toHaveLength(0);
    expect(await get(s.e)).toMatchObject({
      forwarded_at: null,
      tailor_response: 'pending',
    });
  });

  it('records a reported completion with who reported it, both or neither', async () => {
    const s = await setup();
    expect(
      (
        await run(
          s,
          form({
            completion_reported_at: '2026-06-09',
            completion_reported_by: 'tailor',
          }),
        )
      ).ok,
    ).toBe(true);
    expect(await get(s.e)).toMatchObject({
      completion_reported_at: '2026-06-09',
      completion_reported_by: 'tailor',
    });
    expect(
      await run(s, form({ completion_reported_at: '2026-06-09' })),
    ).toMatchObject({ ok: false, error: 'invalid' });
    expect(
      await run(s, form({ completion_reported_by: 'customer' })),
    ).toMatchObject({ ok: false, error: 'invalid' });
    expect(
      await run(
        s,
        form({
          completion_reported_at: '2026-06-09',
          completion_reported_by: 'robot',
        }),
      ),
    ).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('lets only the owner mark a completion as owner-confirmed, and protects it from managers', async () => {
    const s = await setup();
    const confirmed = form({
      completion_reported_at: '2026-06-09',
      completion_reported_by: 'owner_confirmed',
    });
    expect(await run(s, confirmed, 'manager')).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await run(s, confirmed, 'owner')).toEqual({ ok: true });
    // a manager may still edit other fields while leaving the confirmed completion as it is
    expect(
      (await run(s, { ...confirmed, forwarded_via: 'phone' }, 'manager')).ok,
    ).toBe(true);
    // but may not change or clear it
    expect(
      await run(
        s,
        form({
          completion_reported_at: '2026-06-09',
          completion_reported_by: 'tailor',
        }),
        'manager',
      ),
    ).toEqual({ ok: false, error: 'forbidden' });
    expect(await run(s, form(), 'manager')).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect((await get(s.e)).completion_reported_by).toBe('owner_confirmed');
  });

  it('allows clearing a reported completion (a correction) unless a fee depends on it', async () => {
    const s = await setup();
    await run(
      s,
      form({
        completion_reported_at: '2026-06-09',
        completion_reported_by: 'tailor',
      }),
    );
    expect((await run(s, form())).ok).toBe(true);
    expect((await get(s.e)).completion_reported_at).toBeNull();
    await run(
      s,
      form({
        completion_reported_at: '2026-06-09',
        completion_reported_by: 'tailor',
      }),
    );
    await db
      .prepare('UPDATE referral SET fee_amount = 500 WHERE id = ?')
      .bind(s.id)
      .run();
    // only the owner is told a fee exists; a manager just gets a neutral refusal
    expect(await run(s, form(), 'manager')).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(await run(s, form(), 'owner')).toEqual({
      ok: false,
      error: 'has_fee',
    });
    expect((await get(s.e)).completion_reported_at).toBe('2026-06-09');
  });

  it('refuses a referral that belongs to another enquiry or does not exist, and never touches fees', async () => {
    const a = await setup();
    const b = await setup();
    expect(
      await updateReferral(db, {
        enquiryId: b.e,
        referralId: a.id,
        userId: a.who,
        role: 'owner',
        input: form({ forwarded_via: 'sms' }),
      }),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(
      await updateReferral(db, {
        enquiryId: a.e,
        referralId: 999_999,
        userId: a.who,
        role: 'owner',
        input: form(),
      }),
    ).toEqual({ ok: false, error: 'not_found' });
    await db
      .prepare(
        "UPDATE referral SET completion_reported_at = '2026-06-01', completion_reported_by = 'tailor', fee_amount = 777, fee_status = 'due' WHERE id = ?",
      )
      .bind(a.id)
      .run();
    await run(
      a,
      form({
        completion_reported_at: '2026-06-01',
        completion_reported_by: 'tailor',
        forwarded_via: 'sms',
      }),
      'owner',
    );
    expect(await get(a.e)).toMatchObject({
      fee_amount: 777,
      fee_status: 'due',
    });
  });

  it('writes one id-only audit row per change and keeps hostile text as plain text', async () => {
    const s = await setup();
    const hostile = `<script>alert(1)</script>' OR 1=1 --`;
    await run(s, form({ fields_shared_note: hostile }));
    expect((await get(s.e)).fields_shared_note).toBe(hostile);
    const rows = await audits(s.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      admin_user_id: s.who,
      entity_type: 'referral',
      entity_id: s.id,
    });
    expect(JSON.stringify(rows)).not.toMatch(/script|Fake|\+670|2026-06/);
  });
});

describe('rules that hold even when something changes between the checks and the write', () => {
  it('refuses to make a second referral active again by editing (declined back to pending or accepted)', async () => {
    const s = await setup();
    await db
      .prepare("UPDATE referral SET tailor_response = 'declined' WHERE id = ?")
      .bind(s.id)
      .run();
    const t2 = (
      await db
        .prepare(
          "INSERT INTO tailor (slug, display_name, status) VALUES (?, ?, 'approved')",
        )
        .bind(`ru-x-${++n}`, `RU X ${n}`)
        .run()
    ).meta.last_row_id as number;
    const second = await createReferral(db, {
      enquiryId: s.e,
      tailorId: t2,
      userId: s.who,
    });
    if (!second.ok) throw new Error('second');
    for (const response of ['pending', 'accepted'])
      expect(
        await run(s, form({ tailor_response: response })),
        response,
      ).toEqual({ ok: false, error: 'already_active' });
    expect((await get(s.e)).tailor_response).toBe('declined');
    // ...but declining or no response is always fine, and the active one may be edited
    expect((await run(s, form({ tailor_response: 'no_response' }))).ok).toBe(
      true,
    );
    expect(
      await updateReferral(db, {
        enquiryId: s.e,
        referralId: second.id,
        userId: s.who,
        role: 'manager',
        input: form({ tailor_response: 'accepted' }),
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });

  it('does not let a manager overwrite a completion the owner confirmed a moment earlier', async () => {
    const s = await setup();
    await run(
      s,
      form({
        completion_reported_at: '2026-06-09',
        completion_reported_by: 'tailor',
      }),
      'manager',
    );
    const real = db;
    const racing = {
      prepare: (sql: string) => real.prepare(sql),
      batch: async (statements: D1PreparedStatement[]) => {
        // the owner confirms after the manager's checks have passed
        await real
          .prepare(
            "UPDATE referral SET completion_reported_by = 'owner_confirmed' WHERE id = ?",
          )
          .bind(s.id)
          .run();
        return real.batch(statements);
      },
    } as unknown as D1Database;
    const result = await updateReferral(racing, {
      enquiryId: s.e,
      referralId: s.id,
      userId: s.who,
      role: 'manager',
      input: form({
        completion_reported_at: '2026-06-09',
        completion_reported_by: 'customer',
        forwarded_via: 'sms',
      }),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(await get(s.e)).toMatchObject({
      completion_reported_by: 'owner_confirmed',
      forwarded_via: null,
    });
  });
});
