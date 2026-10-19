import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { setFeeTerms } from '../../src/modules/tailors/fees';

const db = env.DB;
let n = 0;
const user = async () =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(`f${++n}@example.test`, 'h', 'owner')
      .run()
  ).meta.last_row_id;
const tailor = async () =>
  (
    await db
      .prepare('INSERT INTO tailor (slug, display_name) VALUES (?, ?)')
      .bind(`fee-${++n}`, 'Fee Fake')
      .run()
  ).meta.last_row_id;
const terms = (id: number) =>
  db
    .prepare(
      'SELECT fee_terms_text, fee_terms_agreed_on FROM tailor WHERE id = ?',
    )
    .bind(id)
    .first<Record<string, unknown>>();

describe('setFeeTerms (FR-REF-08)', () => {
  it('lets only the owner record the agreed terms and date', async () => {
    const [by, id] = [await user(), await tailor()];
    expect(
      await setFeeTerms(db, by, 'owner', id, {
        text: '10% of the order, paid monthly',
        agreed_on: '2026-09-30',
      }),
    ).toEqual({ ok: true });
    expect(await terms(id)).toEqual({
      fee_terms_text: '10% of the order, paid monthly',
      fee_terms_agreed_on: '2026-09-30',
    });
  });

  it('refuses a manager, editor and viewer, and changes nothing', async () => {
    const [by, id] = [await user(), await tailor()];
    for (const role of ['manager', 'editor', 'viewer', 'nobody']) {
      expect(
        await setFeeTerms(db, by, role, id, {
          text: 'sneaky',
          agreed_on: '2026-01-01',
        }),
      ).toEqual({ ok: false, error: 'forbidden' });
    }
    expect(await terms(id)).toEqual({
      fee_terms_text: null,
      fee_terms_agreed_on: null,
    });
  });

  it('can be cleared with blank values, and rejects a bad date, a very long text and an unknown tailor', async () => {
    const [by, id] = [await user(), await tailor()];
    await setFeeTerms(db, by, 'owner', id, {
      text: 'terms',
      agreed_on: '2026-01-01',
    });
    expect(
      await setFeeTerms(db, by, 'owner', id, { text: '  ', agreed_on: '' }),
    ).toEqual({ ok: true });
    expect(await terms(id)).toEqual({
      fee_terms_text: null,
      fee_terms_agreed_on: null,
    });
    expect(
      await setFeeTerms(db, by, 'owner', id, {
        text: 'x',
        agreed_on: '2026-02-30',
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await setFeeTerms(db, by, 'owner', id, {
        text: 'x'.repeat(2001),
        agreed_on: '',
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await setFeeTerms(db, by, 'owner', 999999, { text: 'x', agreed_on: '' }),
    ).toEqual({ ok: false, error: 'not_found' });
  });

  it('audits by id only: the terms never reach the log', async () => {
    const [by, id] = [await user(), await tailor()];
    await setFeeTerms(db, by, 'owner', id, {
      text: 'Confidential fee wording',
      agreed_on: '2026-01-01',
    });
    const rows = await db
      .prepare(
        "SELECT * FROM audit_log WHERE action = 'fee_terms_changed' AND admin_user_id = ?",
      )
      .bind(by)
      .all();
    expect(rows.results).toHaveLength(1);
    expect(JSON.stringify(rows.results)).not.toContain('Confidential');
  });
});
