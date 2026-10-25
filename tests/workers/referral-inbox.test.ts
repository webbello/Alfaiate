import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  answerReferral,
  getInboxItem,
  listInbox,
  sendToInbox,
  takeBackFromInbox,
  waitingCount,
} from '../../src/modules/referral/inbox';

// FR-TPO-09..12: a tailor sees only referrals staff sent to them, what is asked before accepting, the customer's details only after accepting and only while the request is open.
const db = env.DB;
let n = 0;
const run = (sql: string, ...args: (string | number | null)[]) =>
  db
    .prepare(sql)
    .bind(...args)
    .run();

async function world() {
  const k = String(++n).padStart(6, '0');
  await run(
    "INSERT OR IGNORE INTO garment_category (slug, name) VALUES ('inbox-cat-fake', 'Inbox Cat Fake')",
  );
  await run(
    "INSERT OR IGNORE INTO service_area (slug, name) VALUES ('inbox-area-fake', 'Inbox Area Fake')",
  );
  const tailor = async (label: string) => {
    const id = (
      await run(
        "INSERT INTO tailor (slug, display_name, status) VALUES (?, ?, 'approved')",
        `inbox-${label}-${k}`,
        `Inbox ${label} ${k}`,
      )
    ).meta.last_row_id;
    const account = (
      await run('INSERT INTO tailor_account (tailor_id) VALUES (?)', id)
    ).meta.last_row_id;
    return { tailorId: id, accountId: account };
  };
  const a = await tailor('a');
  const b = await tailor('b');
  const enquiry = (
    await run(
      `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status,
         garment_category_id, area_id, area_text, preferred_datetime_text, notes)
       VALUES (?, 'Inbox Fake Customer', '+67070009999', 'whatsapp', 1, 'v1', '2026-01-01T00:00:00Z', 'referred',
         (SELECT id FROM garment_category WHERE slug = 'inbox-cat-fake'), (SELECT id FROM service_area WHERE slug = 'inbox-area-fake'),
         'blue gate by the fake market', 'This week', 'secret fake note')`,
      `AT-I${k}`,
    )
  ).meta.last_row_id;
  const referral = (
    await run(
      'INSERT INTO referral (enquiry_id, tailor_id) VALUES (?, ?)',
      enquiry,
      a.tailorId,
    )
  ).meta.last_row_id;
  const userId = (
    await run(
      "INSERT INTO admin_user (email, password_hash, role) VALUES (?, 'x', 'manager')",
      `inbox-staff-${k}@example.test`,
    )
  ).meta.last_row_id;
  return { a, b, enquiry, referral, userId };
}
const SECRETS = [
  'Inbox Fake Customer',
  '67070009999',
  'blue gate',
  'secret fake note',
  'whatsapp',
];

describe('tailor inbox', () => {
  it('shows nothing until staff send it, and nothing to another tailor', async () => {
    const w = await world();
    expect(await listInbox(db, w.a.tailorId)).toEqual([]);
    expect(await getInboxItem(db, w.a.tailorId, w.referral)).toBeNull();
    expect(await waitingCount(db, w.a.tailorId)).toBe(0);
    expect(
      await sendToInbox(db, {
        enquiryId: w.enquiry,
        referralId: w.referral,
        userId: w.userId,
      }),
    ).toBe('ok');
    expect(await getInboxItem(db, w.b.tailorId, w.referral)).toBeNull(); // another tailor, even with the right id
    expect(await listInbox(db, w.b.tailorId)).toEqual([]);
    expect(
      await getInboxItem(db, w.a.tailorId, w.referral + 999999),
    ).toBeNull();
  });

  it('before accepting shows what is asked and none of who asks', async () => {
    const w = await world();
    await sendToInbox(db, {
      enquiryId: w.enquiry,
      referralId: w.referral,
      userId: w.userId,
    });
    const item = (await getInboxItem(db, w.a.tailorId, w.referral))!;
    expect(item).toMatchObject({
      state: 'waiting',
      category: 'Inbox Cat Fake',
      area: 'Inbox Area Fake',
      preferredTime: 'This week',
      contact: null,
    });
    const everything = JSON.stringify([
      item,
      await listInbox(db, w.a.tailorId),
    ]);
    for (const secret of SECRETS)
      expect(everything, secret).not.toContain(secret);
    expect(await waitingCount(db, w.a.tailorId)).toBe(1);
  });

  it('accepting shows exactly what the customer agreed to share; declining never does', async () => {
    const w = await world();
    await sendToInbox(db, {
      enquiryId: w.enquiry,
      referralId: w.referral,
      userId: w.userId,
    });
    const session = { tailorId: w.a.tailorId, accountId: w.a.accountId };
    expect(
      await answerReferral(db, session, w.referral, { answer: 'accept' }),
    ).toBe('ok');
    const item = (await getInboxItem(db, w.a.tailorId, w.referral))!;
    expect(item.state).toBe('accepted');
    expect(item.contact).toEqual({
      name: 'Inbox Fake Customer',
      number: '+67070009999',
      channel: 'whatsapp',
      areaText: 'blue gate by the fake market',
      notes: 'secret fake note',
    });
    expect(
      await answerReferral(db, session, w.referral, { answer: 'decline' }),
    ).toBe('already_answered');
    expect(await waitingCount(db, w.a.tailorId)).toBe(0);

    const d = await world();
    await sendToInbox(db, {
      enquiryId: d.enquiry,
      referralId: d.referral,
      userId: d.userId,
    });
    const declinedSession = {
      tailorId: d.a.tailorId,
      accountId: d.a.accountId,
    };
    expect(
      await answerReferral(db, declinedSession, d.referral, {
        answer: 'decline',
        reason: 'too_far',
      }),
    ).toBe('ok');
    const declined = (await getInboxItem(db, d.a.tailorId, d.referral))!;
    expect(declined).toMatchObject({
      state: 'declined',
      declineReason: 'too_far',
      contact: null,
    });
    for (const secret of SECRETS)
      expect(JSON.stringify(declined), secret).not.toContain(secret);
  });

  it('refuses another tailor, a bad answer, a bad reason and an unsent referral, and audits an answer with the tailor as actor', async () => {
    const w = await world();
    const mine = { tailorId: w.a.tailorId, accountId: w.a.accountId };
    expect(
      await answerReferral(db, mine, w.referral, { answer: 'accept' }),
    ).toBe('not_found'); // not sent yet
    await sendToInbox(db, {
      enquiryId: w.enquiry,
      referralId: w.referral,
      userId: w.userId,
    });
    expect(
      await answerReferral(
        db,
        { tailorId: w.b.tailorId, accountId: w.b.accountId },
        w.referral,
        { answer: 'accept' },
      ),
    ).toBe('not_found');
    expect(
      await answerReferral(db, mine, w.referral, { answer: 'maybe' }),
    ).toBe('invalid');
    expect(
      await answerReferral(db, mine, w.referral, {
        answer: 'decline',
        reason: 'because',
      }),
    ).toBe('invalid');
    expect(
      await getInboxItem(db, w.a.tailorId, w.referral).then((i) => i!.state),
    ).toBe('waiting');
    expect(
      await answerReferral(db, mine, w.referral, { answer: 'accept' }),
    ).toBe('ok');
    const logged = await db
      .prepare(
        "SELECT admin_user_id, tailor_account_id, entity_id FROM audit_log WHERE action = 'referral_tailor_answered' AND entity_id = ?",
      )
      .bind(w.referral)
      .first<{
        admin_user_id: number | null;
        tailor_account_id: number;
        entity_id: number;
      }>();
    expect(logged).toEqual({
      admin_user_id: null,
      tailor_account_id: w.a.accountId,
      entity_id: w.referral,
    });
  });

  it('hides the details when the request is closed or anonymised, even after accepting', async () => {
    for (const close of [
      "UPDATE enquiry SET status = 'cancelled' WHERE id = ?",
      "UPDATE enquiry SET status = 'not_converted' WHERE id = ?",
      "UPDATE enquiry SET status = 'completed_reported' WHERE id = ?",
      "UPDATE enquiry SET customer_name = NULL, contact_number_e164 = NULL, notes = NULL, service_description = NULL, area_text = NULL, preferred_datetime_text = NULL, anonymised_at = '2026-02-01T00:00:00Z' WHERE id = ?",
    ]) {
      const w = await world();
      await sendToInbox(db, {
        enquiryId: w.enquiry,
        referralId: w.referral,
        userId: w.userId,
      });
      await answerReferral(
        db,
        { tailorId: w.a.tailorId, accountId: w.a.accountId },
        w.referral,
        { answer: 'accept' },
      );
      expect((await getInboxItem(db, w.a.tailorId, w.referral))!.state).toBe(
        'accepted',
      );
      await run(close, w.enquiry);
      const item = (await getInboxItem(db, w.a.tailorId, w.referral))!;
      expect(item.state, close).toBe('closed');
      expect(item.contact, close).toBeNull();
      for (const secret of SECRETS)
        expect(JSON.stringify(item), secret).not.toContain(secret);
    }
  });

  it('lets staff take it back until the tailor accepts, and refuses to send a closed request', async () => {
    const w = await world();
    const args = {
      enquiryId: w.enquiry,
      referralId: w.referral,
      userId: w.userId,
    };
    expect(await takeBackFromInbox(db, args)).toBe('unchanged');
    expect(await sendToInbox(db, args)).toBe('ok');
    expect(await sendToInbox(db, args)).toBe('unchanged');
    expect(await takeBackFromInbox(db, args)).toBe('ok');
    expect(await getInboxItem(db, w.a.tailorId, w.referral)).toBeNull();
    await sendToInbox(db, args);
    await answerReferral(
      db,
      { tailorId: w.a.tailorId, accountId: w.a.accountId },
      w.referral,
      { answer: 'accept' },
    );
    expect(await takeBackFromInbox(db, args)).toBe('accepted');
    expect(
      await sendToInbox(db, { ...args, enquiryId: w.enquiry + 999999 }),
    ).toBe('not_found');
    const c = await world();
    await run(
      "UPDATE enquiry SET status = 'cancelled' WHERE id = ?",
      c.enquiry,
    );
    expect(
      await sendToInbox(db, {
        enquiryId: c.enquiry,
        referralId: c.referral,
        userId: c.userId,
      }),
    ).toBe('closed');
  });
});
