import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { anonymiseEnquiry } from '../../src/modules/enquiry/anonymise';
import { metrics } from '../../src/modules/reporting/metrics';

// PRV-04, FR-ADM-09: after anonymising, no personal text of the customer remains anywhere in the database, and the reporting figures are unchanged.
const db = env.DB;
const MARK = {
  name: 'ANON-MARK-NAME',
  phone: '+67077000999',
  notes: 'ANON-MARK-NOTES',
  service: 'ANON-MARK-SERVICE',
  area: 'ANON-MARK-AREA',
  when: 'ANON-MARK-WHEN',
  shared: 'ANON-MARK-SHARED',
  closed: 'ANON-MARK-CLOSED',
  order: 'ANON-MARK-ORDER',
  note: 'ANON-MARK-INTERNAL-NOTE',
};
let n = 0;
const seed = async () => {
  const who = (
    await db
      .prepare(
        "INSERT INTO admin_user (email, password_hash, role) VALUES (?, 'h', 'owner')",
      )
      .bind(`an${++n}@example.test`)
      .run()
  ).meta.last_row_id as number;
  const cat = (
    await db
      .prepare('INSERT INTO garment_category (slug, name) VALUES (?, ?)')
      .bind(`an-cat-${n}`, `AN Cat ${n}`)
      .run()
  ).meta.last_row_id as number;
  const reference = `AT-AN${String(++n).padStart(6, '0')}`;
  const id = (
    await db
      .prepare(
        `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, garment_category_id, service_description, area_text, preferred_datetime_text, notes, source, consent_shared_with_tailor, consent_text_version, consent_at, status)
    VALUES (?, ?, ?, 'phone', ?, ?, ?, ?, ?, 'form', 1, 'v', '2026-01-01T00:00:00Z', 'completed_reported')`,
      )
      .bind(
        reference,
        MARK.name,
        MARK.phone,
        cat,
        MARK.service,
        MARK.area,
        MARK.when,
        MARK.notes,
      )
      .run()
  ).meta.last_row_id as number;
  await db
    .prepare(
      "INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status, changed_by) VALUES (?, NULL, 'new', ?)",
    )
    .bind(id, who)
    .run();
  const tailor = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164, fee_terms_agreed_on) VALUES (?, ?, 'approved', 1, 1, 1, '+67033123456', '2026-01-01')",
      )
      .bind(`an-t-${n}`, `AN Tailor ${n}`)
      .run()
  ).meta.last_row_id as number;
  const referral = (
    await db
      .prepare(
        `INSERT INTO referral (enquiry_id, tailor_id, forwarded_at, tailor_response, completion_reported_at, completion_reported_by, fee_amount, fee_status, fee_basis_note, fields_shared_note, closed_reason, order_value_note)
    VALUES (?, ?, '2026-06-01', 'accepted', '2026-06-05', 'tailor', 5000, 'due', 'agreed terms', ?, ?, ?)`,
      )
      .bind(id, tailor, MARK.shared, MARK.closed, MARK.order)
      .run()
  ).meta.last_row_id as number;
  await db
    .prepare(
      'INSERT INTO internal_note (body, author_id, enquiry_id) VALUES (?, ?, ?)',
    )
    .bind(MARK.note, who, id)
    .run();
  await db
    .prepare(
      'INSERT INTO internal_note (body, author_id, referral_id) VALUES (?, ?, ?)',
    )
    .bind('unrelated referral note', who, referral)
    .run();
  return { who, id, reference, referral, cat, tailor };
};
const everything = async () => {
  const tables = (
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
      )
      .all<{ name: string }>()
  ).results;
  const dump: string[] = [];
  for (const t of tables)
    dump.push(
      JSON.stringify(
        (await db.prepare(`SELECT * FROM ${t.name}`).all()).results,
      ),
    );
  return dump.join('\n');
};
const row = (id: number) =>
  db
    .prepare('SELECT * FROM enquiry WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();

describe('anonymiseEnquiry (PRV-04, FR-ADM-09)', () => {
  it('removes every trace of the customer from the whole database', async () => {
    const s = await seed();
    const before = await everything();
    for (const mark of Object.values(MARK))
      expect(before, mark).toContain(mark); // sanity: the markers were really stored
    expect(
      await anonymiseEnquiry(db, {
        id: s.id,
        reference: s.reference,
        userId: s.who,
      }),
    ).toBe('ok');
    const after = await everything();
    for (const mark of Object.values(MARK))
      expect(after, mark).not.toContain(mark);
  });

  it('keeps what reporting needs, and the figures do not change', async () => {
    const s = await seed();
    const before = await metrics(db, 'all', { withFees: true });
    const kept = await row(s.id);
    await anonymiseEnquiry(db, {
      id: s.id,
      reference: s.reference,
      userId: s.who,
    });
    const after = await row(s.id);
    expect(after).toMatchObject({
      status: 'completed_reported',
      garment_category_id: s.cat,
      source: 'form',
      reference_code: s.reference,
      created_at: kept!.created_at,
      consent_text_version: 'v',
    });
    expect(after!.anonymised_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    for (const col of [
      'customer_name',
      'contact_number_e164',
      'notes',
      'service_description',
      'area_text',
      'preferred_datetime_text',
    ])
      expect(after![col], col).toBeNull();
    expect(await metrics(db, 'all', { withFees: true })).toEqual(before);
    const referral = await db
      .prepare('SELECT * FROM referral WHERE id = ?')
      .bind(s.referral)
      .first<Record<string, unknown>>();
    expect(referral).toMatchObject({
      fee_amount: 5000,
      fee_status: 'due',
      tailor_response: 'accepted',
      completion_reported_by: 'tailor',
      fee_basis_note: 'agreed terms',
      fields_shared_note: null,
      closed_reason: null,
      order_value_note: null,
    });
    expect(
      (await db
        .prepare(
          'SELECT count(*) AS c FROM enquiry_status_log WHERE enquiry_id = ?',
        )
        .bind(s.id)
        .first<{ c: number }>())!.c,
    ).toBe(1);
  });

  it("deletes only this enquiry's own notes and writes one audit row with ids only", async () => {
    const s = await seed();
    await anonymiseEnquiry(db, {
      id: s.id,
      reference: s.reference,
      userId: s.who,
    });
    expect(
      (await db
        .prepare('SELECT count(*) AS c FROM internal_note WHERE enquiry_id = ?')
        .bind(s.id)
        .first<{ c: number }>())!.c,
    ).toBe(0);
    expect(
      (await db
        .prepare(
          'SELECT count(*) AS c FROM internal_note WHERE referral_id = ?',
        )
        .bind(s.referral)
        .first<{ c: number }>())!.c,
    ).toBe(1);
    const audit = (
      await db
        .prepare(
          "SELECT * FROM audit_log WHERE action = 'enquiry_anonymised' AND entity_id = ?",
        )
        .bind(s.id)
        .all<Record<string, unknown>>()
    ).results;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      admin_user_id: s.who,
      entity_type: 'enquiry',
    });
    expect(JSON.stringify(audit)).not.toMatch(/ANON-MARK|\+670|AT-AN/);
  });

  it('needs the reference code typed exactly (case and spaces aside) and changes nothing otherwise', async () => {
    const s = await seed();
    for (const wrong of [
      '',
      'AT-WRONG',
      s.reference + 'X',
      'yes',
      String(s.id),
    ])
      expect(
        await anonymiseEnquiry(db, {
          id: s.id,
          reference: wrong,
          userId: s.who,
        }),
        wrong,
      ).toBe('wrong_reference');
    expect((await row(s.id))!.customer_name).toBe(MARK.name);
    expect(
      await anonymiseEnquiry(db, {
        id: s.id,
        reference: `  ${s.reference.toLowerCase()} `,
        userId: s.who,
      }),
    ).toBe('ok');
  });

  it('does nothing twice, and refuses an unknown enquiry', async () => {
    const s = await seed();
    await anonymiseEnquiry(db, {
      id: s.id,
      reference: s.reference,
      userId: s.who,
    });
    expect(
      await anonymiseEnquiry(db, {
        id: s.id,
        reference: s.reference,
        userId: s.who,
      }),
    ).toBe('already');
    expect(
      (await db
        .prepare(
          "SELECT count(*) AS c FROM audit_log WHERE action = 'enquiry_anonymised' AND entity_id = ?",
        )
        .bind(s.id)
        .first<{ c: number }>())!.c,
    ).toBe(1);
    expect(
      await anonymiseEnquiry(db, {
        id: 999_999,
        reference: 'AT-NOPE',
        userId: s.who,
      }),
    ).toBe('not_found');
  });

  it('cannot be given a new referral afterwards (the database refuses)', async () => {
    const s = await seed();
    await anonymiseEnquiry(db, {
      id: s.id,
      reference: s.reference,
      userId: s.who,
    });
    await expect(
      db
        .prepare('INSERT INTO referral (enquiry_id, tailor_id) VALUES (?, ?)')
        .bind(s.id, s.tailor)
        .run(),
    ).rejects.toThrow(/sharing consent/);
  });
});
