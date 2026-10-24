import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';

const db = env.DB;
const run = (sql: string, ...binds: unknown[]) =>
  db
    .prepare(sql)
    .bind(...binds)
    .run();
const first = <T>(sql: string, ...binds: unknown[]) =>
  db
    .prepare(sql)
    .bind(...binds)
    .first<T>();

let counter = 0;
const next = () => `x${++counter}`;

const addEnquiry = async (overrides: Record<string, unknown> = {}) => {
  const row = {
    reference_code: `REF-${next()}`,
    customer_name: 'Fake Customer',
    contact_number_e164: '+67077000000',
    contact_channel: 'whatsapp',
    consent_shared_with_tailor: 1,
    consent_text_version: 'v1',
    consent_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
  const cols = Object.keys(row);
  const result = await run(
    `INSERT INTO enquiry (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    ...Object.values(row),
  );
  return result.meta.last_row_id;
};
const addTailor = async (status = 'draft') =>
  (
    await run(
      'INSERT INTO tailor (slug, display_name, status) VALUES (?, ?, ?)',
      next(),
      'Fake Tailor',
      status,
    )
  ).meta.last_row_id;
const addUser = async () =>
  (
    await run(
      'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      `${next()}@example.test`,
      'hash',
      'owner',
    )
  ).meta.last_row_id;
const addReferral = async (enquiryId: unknown, tailorId: unknown, extra = '') =>
  run(
    `INSERT INTO referral (enquiry_id, tailor_id${extra ? ', ' + extra.split('=')[0] : ''}) VALUES (?, ?${extra ? ', ' + extra.split('=')[1] : ''})`,
    enquiryId,
    tailorId,
  );

describe('enquiry', () => {
  it('stores a valid enquiry with status new and not spam', async () => {
    const id = await addEnquiry();
    const row = await first<{ status: string; is_spam: number }>(
      'SELECT status, is_spam FROM enquiry WHERE id = ?',
      id,
    );
    expect(row).toEqual({ status: 'new', is_spam: 0 });
  });

  it('rejects an enquiry without consent (BR-08, PRV-03)', async () => {
    await expect(
      addEnquiry({ consent_shared_with_tailor: 0 }),
    ).rejects.toThrow();
  });

  it('rejects a missing consent version or time', async () => {
    await expect(addEnquiry({ consent_text_version: null })).rejects.toThrow();
    await expect(addEnquiry({ consent_at: null })).rejects.toThrow();
  });

  it('rejects a duplicate reference code', async () => {
    await addEnquiry({ reference_code: 'REF-DUP' });
    await expect(addEnquiry({ reference_code: 'REF-DUP' })).rejects.toThrow();
  });

  it('rejects an unknown status and an unknown contact channel', async () => {
    await expect(addEnquiry({ status: 'done' })).rejects.toThrow();
    await expect(addEnquiry({ contact_channel: 'email' })).rejects.toThrow();
  });

  it('accepts each of the seven statuses', async () => {
    for (const s of [
      'new',
      'contacted',
      'referred',
      'accepted_by_tailor',
      'completed_reported',
      'not_converted',
      'cancelled',
    ]) {
      await addEnquiry({ status: s });
    }
  });

  it('requires a name and a valid E.164 number while not anonymised', async () => {
    await expect(addEnquiry({ customer_name: null })).rejects.toThrow();
    await expect(addEnquiry({ customer_name: '  ' })).rejects.toThrow();
    await expect(
      addEnquiry({ contact_number_e164: '77000000' }),
    ).rejects.toThrow();
    await expect(addEnquiry({ contact_number_e164: null })).rejects.toThrow();
  });

  it('can be anonymised: personal fields cleared, reporting fields kept', async () => {
    const id = await addEnquiry({
      notes: 'private note',
      service_description: 'a suit',
    });
    await run(
      `UPDATE enquiry SET customer_name = NULL, contact_number_e164 = NULL, notes = NULL, service_description = NULL,
         anonymised_at = '2026-02-01T00:00:00Z' WHERE id = ?`,
      id,
    );
    const row = await first<{ status: string; anonymised_at: string }>(
      'SELECT status, anonymised_at FROM enquiry WHERE id = ?',
      id,
    );
    expect(row?.anonymised_at).toBe('2026-02-01T00:00:00Z');
  });

  it('also requires the free-text location and time fields to be cleared when anonymising', async () => {
    const id = await addEnquiry({
      area_text: 'near the market',
      preferred_datetime_text: 'Friday morning',
    });
    await expect(
      run(
        "UPDATE enquiry SET customer_name = NULL, contact_number_e164 = NULL, notes = NULL, service_description = NULL, anonymised_at = '2026-02-01T00:00:00Z' WHERE id = ?",
        id,
      ),
    ).rejects.toThrow();
  });

  it('refuses to mark an enquiry anonymised while personal data remains', async () => {
    const id = await addEnquiry({ notes: 'still here' });
    await expect(
      run(
        "UPDATE enquiry SET anonymised_at = '2026-02-01T00:00:00Z' WHERE id = ?",
        id,
      ),
    ).rejects.toThrow();
  });
});

describe('enquiry_status_log', () => {
  it('records a change and rejects an unknown to_status', async () => {
    const enquiry = await addEnquiry();
    const user = await addUser();
    await run(
      "INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status, changed_by) VALUES (?, 'new', 'contacted', ?)",
      enquiry,
      user,
    );
    await expect(
      run(
        "INSERT INTO enquiry_status_log (enquiry_id, to_status) VALUES (?, 'done')",
        enquiry,
      ),
    ).rejects.toThrow();
  });

  it('is deleted with its enquiry', async () => {
    const enquiry = await addEnquiry();
    await run(
      "INSERT INTO enquiry_status_log (enquiry_id, to_status) VALUES (?, 'contacted')",
      enquiry,
    );
    await run('DELETE FROM enquiry WHERE id = ?', enquiry);
    expect(
      await first(
        'SELECT 1 FROM enquiry_status_log WHERE enquiry_id = ?',
        enquiry,
      ),
    ).toBeNull();
  });
});

describe('referral', () => {
  it('is created for an approved tailor and an enquiry with consent, response pending, fee not due', async () => {
    const enquiry = await addEnquiry();
    const tailor = await addTailor('approved');
    await addReferral(enquiry, tailor);
    const row = await first<{ tailor_response: string; fee_status: string }>(
      'SELECT tailor_response, fee_status FROM referral WHERE enquiry_id = ?',
      enquiry,
    );
    expect(row).toEqual({ tailor_response: 'pending', fee_status: 'not_due' });
  });

  it.each(['draft', 'suspended', 'archived'])(
    'is refused for a %s tailor (FR-REF-02, AC-12)',
    async (status) => {
      const enquiry = await addEnquiry();
      const tailor = await addTailor(status);
      await expect(addReferral(enquiry, tailor)).rejects.toThrow();
    },
  );

  it('is refused for an anonymised enquiry (nothing left to share)', async () => {
    const tailor = await addTailor('approved');
    const enquiry = await addEnquiry();
    await run(
      "UPDATE enquiry SET customer_name = NULL, contact_number_e164 = NULL, notes = NULL, service_description = NULL, anonymised_at = '2026-02-01T00:00:00Z' WHERE id = ?",
      enquiry,
    );
    await expect(addReferral(enquiry, tailor)).rejects.toThrow();
  });

  it('also refuses to move an existing referral to an unapproved tailor or an anonymised enquiry (BR-08)', async () => {
    const enquiry = await addEnquiry();
    const approved = await addTailor('approved');
    const draft = await addTailor('draft');
    await addReferral(enquiry, approved);
    await expect(
      run(
        'UPDATE referral SET tailor_id = ? WHERE enquiry_id = ?',
        draft,
        enquiry,
      ),
    ).rejects.toThrow();
    const gone = await addEnquiry();
    await run(
      "UPDATE enquiry SET customer_name = NULL, contact_number_e164 = NULL, notes = NULL, service_description = NULL, anonymised_at = '2026-02-01T00:00:00Z' WHERE id = ?",
      gone,
    );
    await expect(
      run(
        'UPDATE referral SET enquiry_id = ? WHERE enquiry_id = ?',
        gone,
        enquiry,
      ),
    ).rejects.toThrow();
  });

  it('allows a second referral after a decline, keeping history (FR-REF-07)', async () => {
    const enquiry = await addEnquiry();
    const t1 = await addTailor('approved');
    const t2 = await addTailor('approved');
    await addReferral(enquiry, t1);
    await run(
      "UPDATE referral SET tailor_response = 'declined' WHERE enquiry_id = ? AND tailor_id = ?",
      enquiry,
      t1,
    );
    await addReferral(enquiry, t2);
    expect(
      (
        await first<{ n: number }>(
          'SELECT count(*) AS n FROM referral WHERE enquiry_id = ?',
          enquiry,
        )
      )?.n,
    ).toBe(2);
  });

  it('rejects unknown tailor_response, forwarded_via and fee_status', async () => {
    const enquiry = await addEnquiry();
    const tailor = await addTailor('approved');
    await expect(
      addReferral(enquiry, tailor, "tailor_response='maybe'"),
    ).rejects.toThrow();
    await expect(
      addReferral(enquiry, tailor, "forwarded_via='pigeon'"),
    ).rejects.toThrow();
    await expect(
      addReferral(enquiry, tailor, "fee_status='owed'"),
    ).rejects.toThrow();
  });

  it('allows a fee amount only after a completion is reported, and requires who reported it (BR-10)', async () => {
    const enquiry = await addEnquiry();
    const tailor = await addTailor('approved');
    await addReferral(enquiry, tailor);
    await expect(
      run('UPDATE referral SET fee_amount = 5 WHERE enquiry_id = ?', enquiry),
    ).rejects.toThrow();
    await expect(
      run(
        "UPDATE referral SET completion_reported_at = '2026-03-01' WHERE enquiry_id = ?",
        enquiry,
      ),
    ).rejects.toThrow();
    await run(
      "UPDATE referral SET completion_reported_at = '2026-03-01', completion_reported_by = 'tailor', fee_amount = 5 WHERE enquiry_id = ?",
      enquiry,
    );
  });

  it('requires a payment date when the fee is marked paid', async () => {
    const enquiry = await addEnquiry();
    const tailor = await addTailor('approved');
    await addReferral(enquiry, tailor);
    await expect(
      run(
        "UPDATE referral SET fee_status = 'paid' WHERE enquiry_id = ?",
        enquiry,
      ),
    ).rejects.toThrow();
    await run(
      "UPDATE referral SET fee_status = 'paid', fee_paid_at = '2026-03-02' WHERE enquiry_id = ?",
      enquiry,
    );
  });

  it('blocks deleting a tailor that has referrals', async () => {
    const enquiry = await addEnquiry();
    const tailor = await addTailor('approved');
    await addReferral(enquiry, tailor);
    await expect(
      run('DELETE FROM tailor WHERE id = ?', tailor),
    ).rejects.toThrow();
  });
});

describe('internal_note', () => {
  it('belongs to exactly one of enquiry, tailor or referral', async () => {
    const user = await addUser();
    const enquiry = await addEnquiry();
    const tailor = await addTailor();
    await run(
      'INSERT INTO internal_note (body, author_id, enquiry_id) VALUES (?, ?, ?)',
      'ok',
      user,
      enquiry,
    );
    await expect(
      run(
        'INSERT INTO internal_note (body, author_id) VALUES (?, ?)',
        'none',
        user,
      ),
    ).rejects.toThrow();
    await expect(
      run(
        'INSERT INTO internal_note (body, author_id, enquiry_id, tailor_id) VALUES (?, ?, ?, ?)',
        'two',
        user,
        enquiry,
        tailor,
      ),
    ).rejects.toThrow();
  });

  it('requires a body', async () => {
    const user = await addUser();
    const tailor = await addTailor();
    await expect(
      run(
        "INSERT INTO internal_note (body, author_id, tailor_id) VALUES ('', ?, ?)",
        user,
        tailor,
      ),
    ).rejects.toThrow();
  });
});

describe('contact_click_daily, rate_limit', () => {
  it('has no customer-photo table until FR-ENQ-07 is built', async () => {
    const found = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name = 'enquiry_attachment'",
      )
      .all();
    expect(found.results).toHaveLength(0);
  });

  it('keeps one click counter per tailor, channel and day, with no visitor data', async () => {
    const tailor = await addTailor();
    await run(
      "INSERT INTO contact_click_daily (tailor_id, channel, day, count) VALUES (?, 'phone', '2026-01-01', 1)",
      tailor,
    );
    await expect(
      run(
        "INSERT INTO contact_click_daily (tailor_id, channel, day, count) VALUES (?, 'phone', '2026-01-01', 1)",
        tailor,
      ),
    ).rejects.toThrow();
    await expect(
      run(
        "INSERT INTO contact_click_daily (tailor_id, channel, day, count) VALUES (?, 'email', '2026-01-02', 1)",
        tailor,
      ),
    ).rejects.toThrow();
    await expect(
      run(
        "INSERT INTO contact_click_daily (tailor_id, channel, day, count) VALUES (?, 'phone', '2026-01-03', -1)",
        tailor,
      ),
    ).rejects.toThrow();
  });

  it('keeps one rate-limit counter per key and window', async () => {
    await run(
      "INSERT INTO rate_limit (key_hash, window_start, count) VALUES ('k', 100, 1)",
    );
    await expect(
      run(
        "INSERT INTO rate_limit (key_hash, window_start, count) VALUES ('k', 100, 1)",
      ),
    ).rejects.toThrow();
    await run(
      "INSERT INTO rate_limit (key_hash, window_start, count) VALUES ('k', 160, 1)",
    );
  });
});
