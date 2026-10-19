import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  addEnquiryNote,
  getEnquiry,
  listLog,
  listNotes,
  setSpam,
  setStatus,
} from '../../src/modules/enquiry/status';
import { forwardingText } from '../../src/modules/enquiry/forwarding';
import { STATUSES } from '../../src/modules/enquiry/queries';

const db = env.DB;
let n = 0;
const admin = async () =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(`es${++n}@example.test`, 'h', 'manager')
      .run()
  ).meta.last_row_id as number;
const enquiry = async () => {
  const ref = `AT-ST${String(++n).padStart(6, '0')}`;
  const id = (
    await db
      .prepare(
        `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, notes, service_description, area_text, preferred_datetime_text, source, consent_shared_with_tailor, consent_text_version, consent_at)
         VALUES (?, 'Fake Status Person', '+67077123456', 'whatsapp', 'Fake customer notes', 'Fake service', 'Fake area text', 'Fake time', 'form', 1, 'v', '2026-01-01T00:00:00Z')`,
      )
      .bind(ref)
      .run()
  ).meta.last_row_id as number;
  await db
    .prepare(
      "INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status) VALUES (?, NULL, 'new')",
    )
    .bind(id)
    .run();
  return { id, ref };
};
const audits = async (id: number) =>
  (
    await db
      .prepare(
        "SELECT * FROM audit_log WHERE entity_type = 'enquiry' AND entity_id = ?",
      )
      .bind(id)
      .all<Record<string, unknown>>()
  ).results;

describe('setStatus (FR-ADM-07, AC-11)', () => {
  it('can set each of the seven statuses, with a log row and an audit row each time', async () => {
    const who = await admin();
    const e = await enquiry();
    let previous = 'new';
    for (const status of STATUSES.filter((s) => s !== 'new')) {
      expect(await setStatus(db, { id: e.id, status, userId: who })).toBe('ok');
      expect((await getEnquiry(db, e.id))!.status).toBe(status);
      const log = await listLog(db, e.id);
      expect(log.at(-1)).toMatchObject({
        from_status: previous,
        to_status: status,
      });
      previous = status;
    }
    expect(await setStatus(db, { id: e.id, status: 'new', userId: who })).toBe(
      'ok',
    ); // back to the start: no enforced order
    expect((await listLog(db, e.id)).length).toBe(8);
    expect((await audits(e.id)).length).toBe(7);
  });

  it('records the time and the admin, and keeps customer data out of the audit row', async () => {
    const who = await admin();
    const e = await enquiry();
    const now = new Date('2030-06-02T10:00:00.000Z');
    await setStatus(db, { id: e.id, status: 'contacted', userId: who, now });
    const row = await getEnquiry(db, e.id);
    expect(row!.status_changed_at).toBe('2030-06-02T10:00:00.000Z');
    const log = await listLog(db, e.id);
    expect(log.at(-1)).toMatchObject({
      changed_at: '2030-06-02T10:00:00.000Z',
    });
    const [a] = await audits(e.id);
    expect(a).toMatchObject({
      admin_user_id: who,
      action: 'enquiry_status_changed',
      entity_type: 'enquiry',
      entity_id: e.id,
    });
    expect(JSON.stringify(a)).not.toMatch(/Fake|\+670|AT-/);
  });

  it('refuses an unknown status or enquiry and changes nothing when the status is already set', async () => {
    const who = await admin();
    const e = await enquiry();
    expect(
      await setStatus(db, { id: e.id, status: 'bogus' as never, userId: who }),
    ).toBe('invalid');
    expect(
      await setStatus(db, { id: 999_999, status: 'contacted', userId: who }),
    ).toBe('not_found');
    expect(await setStatus(db, { id: e.id, status: 'new', userId: who })).toBe(
      'unchanged',
    );
    expect((await listLog(db, e.id)).length).toBe(1);
    expect((await audits(e.id)).length).toBe(0);
  });
});

describe('notes and spam flag (FR-ADM-08)', () => {
  it('adds internal notes, newest last, with the author', async () => {
    const who = await admin();
    const e = await enquiry();
    expect(
      await addEnquiryNote(db, {
        id: e.id,
        body: '  first note  ',
        userId: who,
      }),
    ).toBe('ok');
    await addEnquiryNote(db, { id: e.id, body: 'second note', userId: who });
    const notes = await listNotes(db, e.id);
    expect(notes.map((x) => x.body)).toEqual(['first note', 'second note']);
    expect(notes[0].email).toMatch(/@example.test$/);
  });

  it('refuses an empty or oversized note and a missing enquiry', async () => {
    const who = await admin();
    const e = await enquiry();
    expect(
      await addEnquiryNote(db, { id: e.id, body: '   ', userId: who }),
    ).toBe('invalid');
    expect(
      await addEnquiryNote(db, {
        id: e.id,
        body: 'x'.repeat(2001),
        userId: who,
      }),
    ).toBe('invalid');
    expect(
      await addEnquiryNote(db, { id: 999_999, body: 'orphan', userId: who }),
    ).toBe('not_found');
    expect(await listNotes(db, e.id)).toEqual([]);
  });

  it('flags and unflags spam and audits it', async () => {
    const who = await admin();
    const e = await enquiry();
    expect(await setSpam(db, { id: e.id, spam: true, userId: who })).toBe('ok');
    expect((await getEnquiry(db, e.id))!.is_spam).toBe(1);
    expect(await setSpam(db, { id: e.id, spam: false, userId: who })).toBe(
      'ok',
    );
    expect((await getEnquiry(db, e.id))!.is_spam).toBe(0);
    expect(await setSpam(db, { id: 999_999, spam: true, userId: who })).toBe(
      'not_found',
    );
    expect((await audits(e.id)).map((a) => a.action)).toEqual([
      'enquiry_spam_changed',
      'enquiry_spam_changed',
    ]);
  });
});

describe('forwardingText (BR-08): only what the customer agreed to share', () => {
  it('contains the consented fields and nothing internal', async () => {
    const who = await admin();
    const e = await enquiry();
    await addEnquiryNote(db, {
      id: e.id,
      body: 'SECRET-INTERNAL-ONLY',
      userId: who,
    });
    await setSpam(db, { id: e.id, spam: false, userId: who });
    const text = forwardingText((await getEnquiry(db, e.id))!);
    for (const shown of [
      'Fake Status Person',
      '+67077123456',
      'WhatsApp',
      'Fake service',
      'Fake area text',
      'Fake time',
      'Fake customer notes',
      e.ref,
    ])
      expect(text).toContain(shown);
    for (const hidden of [
      'SECRET-INTERNAL-ONLY',
      'Status:',
      'Source:',
      'consent',
      'spam',
    ])
      expect(text, hidden).not.toContain(hidden);
  });

  it('leaves out empty fields and says nothing for an anonymised enquiry', async () => {
    const e = await enquiry();
    await db
      .prepare(
        'UPDATE enquiry SET notes = NULL, service_description = NULL, area_text = NULL, preferred_datetime_text = NULL WHERE id = ?',
      )
      .bind(e.id)
      .run();
    const text = forwardingText((await getEnquiry(db, e.id))!);
    expect(text).not.toMatch(/Notes|Service|Area|Preferred/);
    await db
      .prepare(
        "UPDATE enquiry SET customer_name = NULL, contact_number_e164 = NULL, anonymised_at = '2026-09-01T00:00:00Z' WHERE id = ?",
      )
      .bind(e.id)
      .run();
    expect(forwardingText((await getEnquiry(db, e.id))!)).toBe('');
  });
});
