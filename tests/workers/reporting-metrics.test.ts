import { beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { metrics } from '../../src/modules/reporting/metrics';

// AC-14: the dashboard figures must equal what a person counts by hand from the records. Every expected value below is written out from
// the dataset in `beforeAll`, not computed with the code under test. "Now" is 15 June 2026, 19:00 in Dili.
const db = env.DB;
const NOW = new Date('2026-06-15T10:00:00Z');
const ids: Record<string, number> = {};
const q = async (sql: string, ...binds: unknown[]) =>
  (
    await db
      .prepare(sql)
      .bind(...binds)
      .run()
  ).meta.last_row_id as number;

beforeAll(async () => {
  // wipe anything other tests in this file's isolated storage might have left
  const user = await q(
    "INSERT INTO admin_user (email, password_hash, role) VALUES ('rm@example.test', 'h', 'owner')",
  );
  const enquiry = async (
    key: string,
    createdAt: string,
    status = 'new',
    spam = 0,
  ) => {
    ids[key] = await q(
      `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status, is_spam, created_at)
       VALUES (?, 'Fake Metrics Person', '+67077123456', 'phone', 1, 'v', '2026-01-01T00:00:00Z', ?, ?, ?)`,
      `AT-M${key}`,
      status,
      spam,
      createdAt,
    );
  };
  const tailor = async (key: string, published: number) => {
    ids[key] = await q(
      "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES (?, ?, 'approved', ?, ?, 1, '+67033123456')",
      `m-${key}`,
      `Metrics ${key}`,
      published,
      published,
    );
  };
  const log = (key: string, to: string, at: string) =>
    q(
      'INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status, changed_by, changed_at) VALUES (?, NULL, ?, ?, ?)',
      ids[key],
      to,
      user,
      at,
    );
  const referral = async (
    key: string,
    e: string,
    t: string,
    o: {
      fwd?: string;
      resp?: string;
      done?: string;
      fee?: number;
      status?: string;
      paid?: string;
    },
  ) => {
    ids[key] = await q(
      `INSERT INTO referral (enquiry_id, tailor_id, forwarded_at, tailor_response, completion_reported_at, completion_reported_by, fee_amount, fee_status, fee_paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ids[e],
      ids[t],
      o.fwd ?? null,
      o.resp ?? 'pending',
      o.done ?? null,
      o.done ? 'tailor' : null,
      o.fee ?? null,
      o.status ?? 'not_due',
      o.paid ?? null,
    );
  };

  await enquiry('E1', '2026-06-05T00:00:00Z', 'new');
  await enquiry('E2', '2026-06-10T00:00:00Z', 'contacted');
  await enquiry('E3', '2026-06-12T00:00:00Z', 'completed_reported');
  await enquiry('E4', '2026-06-20T00:00:00Z', 'referred');
  await enquiry('E5', '2026-05-31T14:59:59Z', 'new'); // 23:59 on 31 May in Dili: before the month
  await enquiry('E6', '2026-05-31T15:00:00Z', 'cancelled'); // 00:00 on 1 June in Dili: first moment of the month
  await enquiry('E7', '2026-06-30T14:59:59Z', 'not_converted'); // last second of June in Dili
  await enquiry('E8', '2026-06-30T15:00:00Z', 'new'); // 1 July in Dili: after the month
  await enquiry('E9', '2026-06-11T00:00:00Z', 'new', 1); // spam: counted nowhere

  await tailor('T1', 1);
  await tailor('T2', 1);
  await tailor('T3', 0); // approved but not published

  await log('E2', 'new', '2026-06-10T00:00:00Z');
  await log('E2', 'contacted', '2026-06-10T06:00:00Z'); // 6 hours
  await log('E3', 'contacted', '2026-06-12T12:00:00Z'); // 12 hours
  await log('E3', 'completed_reported', '2026-06-20T00:00:00Z');
  await log('E4', 'referred', '2026-06-21T00:00:00Z'); // 24 hours
  await log('E1', 'new', '2026-06-05T00:00:00Z'); // never contacted
  await log('E6', 'cancelled', '2026-06-02T00:00:00Z'); // not a first contact
  await log('E9', 'contacted', '2026-06-11T01:00:00Z'); // spam

  await referral('R1', 'E2', 'T1', {
    fwd: '2026-06-10',
    resp: 'accepted',
    done: '2026-06-18',
    fee: 3000,
    status: 'due',
  });
  await referral('R2', 'E3', 'T1', {
    fwd: '2026-06-12',
    resp: 'accepted',
    done: '2026-06-20',
    fee: 5000,
    status: 'paid',
    paid: '2026-06-25',
  });
  await referral('R3', 'E4', 'T2', {
    fwd: '2026-06-21',
    resp: 'pending',
    done: '2026-06-25',
    fee: 2000,
    status: 'disputed',
  });
  await referral('R4', 'E1', 'T3', { fwd: '2026-06-05', resp: 'declined' });
  await referral('R5', 'E6', 'T2', {
    fwd: '2026-06-01',
    resp: 'declined',
    done: '2026-06-02',
    fee: 1000,
    status: 'waived',
  });
  await referral('R6', 'E6', 'T1', {
    fwd: '2026-06-30',
    resp: 'no_response',
    done: '2026-07-02',
    fee: 800,
    status: 'due',
  });
  await referral('R7', 'E8', 'T1', { fwd: '2026-07-01', resp: 'pending' });
  await referral('R8', 'E9', 'T2', {
    fwd: '2026-06-11',
    resp: 'accepted',
    done: '2026-06-12',
    fee: 9999,
    status: 'paid',
    paid: '2026-06-13',
  }); // spam
  await referral('R11', 'E5', 'T1', {
    fwd: '2026-05-21',
    resp: 'accepted',
    done: '2026-05-20',
    fee: 1500,
    status: 'paid',
    paid: '2026-06-02',
  });

  const click = (t: string, channel: string, date: string, count: number) =>
    q(
      'INSERT INTO contact_click_daily (tailor_id, channel, date, count) VALUES (?, ?, ?, ?)',
      ids[t],
      channel,
      date,
      count,
    );
  await click('T1', 'whatsapp', '2026-06-02', 3);
  await click('T1', 'phone', '2026-06-30', 2);
  await click('T2', 'phone', '2026-07-01', 5);
  await click('T2', 'phone', '2026-05-31', 7);
  await click('T2', 'whatsapp', '2026-06-15', 4);
});

const ratio = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  value: denominator === 0 ? null : numerator / denominator,
});
const zeroStatuses = {
  new: 0,
  contacted: 0,
  referred: 0,
  accepted_by_tailor: 0,
  completed_reported: 0,
  not_converted: 0,
  cancelled: 0,
};

describe('metrics for this month (AC-14, FR-RPT-01/02)', () => {
  it('matches the figures counted by hand, fees included for the owner', async () => {
    const m = await metrics(db, 'month', { withFees: true, now: NOW });
    expect(m.enquiries).toBe(6); // E1 E2 E3 E4 E6 E7
    expect(m.byStatus).toEqual({
      ...zeroStatuses,
      new: 1,
      contacted: 1,
      referred: 1,
      completed_reported: 1,
      cancelled: 1,
      not_converted: 1,
    });
    expect(m.referralsForwarded).toBe(6); // R1 R2 R3 R4 R5 R6
    expect(m.referralsAccepted).toBe(2); // R1 R2
    expect(m.m3).toEqual(ratio(2, 6));
    expect(m.m2).toEqual(ratio(5, 6)); // E1 E2 E3 E4 E6 have a referral, E7 has none
    expect(m.completions).toBe(1); // E3
    expect(m.m4).toEqual(ratio(1, 6));
    expect(m.activeTailors).toBe(2); // T1 T2; T3 is not published
    expect(m.contactClicks).toBe(9); // 3 + 2 + 4
    expect(m.timeToFirstContact).toEqual({ averageHours: 14, count: 3 }); // (6 + 12 + 24) / 3
    expect(m.fees).toEqual({
      due: 3000,
      disputed: 2000,
      paid: 5000,
      m9: ratio(5000, 10000),
      m7: 6500,
    });
  });

  it('does not even query fee columns for a caller who may not see them', async () => {
    const seen: string[] = [];
    const spy = {
      prepare: (sql: string) => (seen.push(sql), db.prepare(sql)),
      batch: (statements: D1PreparedStatement[]) => db.batch(statements),
    } as unknown as D1Database;
    await metrics(spy, 'month', { withFees: false, now: NOW });
    expect(seen.length).toBeGreaterThan(3);
    expect(seen.join('\n')).not.toMatch(/fee_/);
    seen.length = 0;
    await metrics(spy, 'month', { withFees: true, now: NOW });
    expect(seen.join('\n')).toMatch(/fee_amount/);
  });

  it('leaves fees out entirely when the caller may not see them', async () => {
    const m = await metrics(db, 'month', { withFees: false, now: NOW });
    expect(Object.keys(m)).not.toContain('fees');
    expect(JSON.stringify(m)).not.toMatch(/3000|5000|6500|fee/i);
    expect(m.enquiries).toBe(6);
  });
});

describe('metrics for the last 30 days and all time', () => {
  it('last 30 days (17 May to 15 June, Dili)', async () => {
    const m = await metrics(db, '30d', { withFees: true, now: NOW });
    expect(m.enquiries).toBe(5); // E1 E2 E3 E5 E6
    expect(m.referralsForwarded).toBe(5); // R1 R2 R4 R5 R11
    expect(m.referralsAccepted).toBe(3); // R1 R2 R11
    expect(m.activeTailors).toBe(2); // T1 T2
    expect(m.contactClicks).toBe(14); // 3 + 7 + 4
    expect(m.fees).toEqual({
      due: 0,
      disputed: 0,
      paid: 1500,
      m9: ratio(1500, 1500),
      m7: 1500,
    });
  });

  it('all time', async () => {
    const m = await metrics(db, 'all', { withFees: true, now: NOW });
    expect(m.enquiries).toBe(8); // E1 to E8
    expect(m.byStatus).toEqual({
      ...zeroStatuses,
      new: 3,
      contacted: 1,
      referred: 1,
      completed_reported: 1,
      cancelled: 1,
      not_converted: 1,
    });
    expect(m.referralsForwarded).toBe(8); // R1 to R7 and R11
    expect(m.referralsAccepted).toBe(3);
    expect(m.m2).toEqual(ratio(7, 8)); // every non-spam enquiry except E7
    expect(m.activeTailors).toBe(2);
    expect(m.contactClicks).toBe(21);
    expect(m.timeToFirstContact).toEqual({ averageHours: 14, count: 3 });
    expect(m.fees).toEqual({
      due: 3800,
      disputed: 2000,
      paid: 6500,
      m9: ratio(6500, 12300),
      m7: 6500,
    });
  });
});

describe('edges and empty data', () => {
  it('shows "no data" (null), never 0 percent, when a denominator is zero', async () => {
    const m = await metrics(db, 'month', {
      withFees: true,
      now: new Date('2030-01-15T00:00:00Z'),
    });
    expect(m.enquiries).toBe(0);
    expect(m.m2).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(m.m3.value).toBeNull();
    expect(m.m4.value).toBeNull();
    expect(m.timeToFirstContact).toEqual({ averageHours: null, count: 0 });
    expect(m.fees!.m9.value).toBeNull();
    expect(m.fees).toMatchObject({ due: 0, disputed: 0, paid: 0, m7: 0 });
    expect(m.byStatus).toEqual(zeroStatuses);
  });

  it('never reads names, numbers or notes', async () => {
    const m = await metrics(db, 'all', { withFees: true, now: NOW });
    expect(JSON.stringify(m)).not.toMatch(/Fake Metrics|\+670|AT-M/);
  });
});
