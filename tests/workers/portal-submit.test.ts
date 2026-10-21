import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import type { TailorSession } from '../../src/modules/portal/session';
import {
  portalChecklist,
  submitForReview,
} from '../../src/modules/portal/checklist';
import { notificationText } from '../../src/modules/notify';

const db = env.DB;
let n = 0;
const make = async (o: { consent?: boolean; status?: string } = {}) => {
  const tailorId = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name) VALUES (?, 'Submit Fake')",
      )
      .bind(`submit-${++n}`)
      .run()
  ).meta.last_row_id;
  if (o.status)
    await db
      .prepare('UPDATE tailor SET status = ? WHERE id = ?')
      .bind(o.status, tailorId)
      .run();
  const accountId = (
    await db
      .prepare(
        'INSERT INTO tailor_account (tailor_id, email, password_hash, consent_at) VALUES (?, ?, ?, ?)',
      )
      .bind(
        tailorId,
        `s${n}@example.test`,
        'x',
        o.consent === false ? null : '2026-06-01T00:00:00Z',
      )
      .run()
  ).meta.last_row_id;
  const session: TailorSession = {
    accountId,
    tailorId,
    email: `s${n}@example.test`,
    csrfToken: 'x',
  };
  return session;
};
const complete = async (s: TailorSession) => {
  const cat = (
    await db
      .prepare("INSERT INTO garment_category (slug, name) VALUES (?, 'S Cat')")
      .bind(`s-cat-${++n}`)
      .run()
  ).meta.last_row_id;
  const area = (
    await db
      .prepare("INSERT INTO service_area (slug, name) VALUES (?, 'S Area')")
      .bind(`s-area-${++n}`)
      .run()
  ).meta.last_row_id;
  await db
    .prepare(
      "UPDATE tailor SET description = 'I sew.', whatsapp_e164 = '+67077123456' WHERE id = ?",
    )
    .bind(s.tailorId)
    .run();
  await db
    .prepare(
      'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
    )
    .bind(s.tailorId, cat)
    .run();
  await db
    .prepare(
      "INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, 'shop_location')",
    )
    .bind(s.tailorId, area)
    .run();
};
const sent: unknown[] = [];
const options = {
  siteUrl: 'https://example.test',
  notify: async (x: unknown) => void sent.push(x),
} as never;

describe('portalChecklist (FR-TPO-06)', () => {
  it('starts with everything to do and ticks items as they are filled', async () => {
    const s = await make();
    expect(
      (await portalChecklist(db, s.tailorId)).map((i) => [i.key, i.done]),
    ).toEqual([
      ['about', false],
      ['work', false],
      ['areas', false],
      ['contact', false],
      ['photos', false],
    ]);
    await complete(s);
    const items = await portalChecklist(db, s.tailorId);
    expect(items.filter((i) => i.required).every((i) => i.done)).toBe(true);
    expect(items.find((i) => i.key === 'photos')).toMatchObject({
      done: false,
      required: false,
    });
  });
});

describe('submitForReview (FR-TPO-06, FR-TPO-07)', () => {
  it('records the request, audits it, tells the owner with a reference and a link only, and changes nothing about the page', async () => {
    const s = await make();
    await complete(s);
    sent.length = 0;
    const before = await db
      .prepare(
        'SELECT status, is_published, permission_recorded FROM tailor WHERE id = ?',
      )
      .bind(s.tailorId)
      .first();
    expect(
      await submitForReview(db, s, options, new Date('2026-06-02T09:00:00Z')),
    ).toEqual({ ok: true });
    expect(
      await db
        .prepare('SELECT review_requested_at FROM tailor_account WHERE id = ?')
        .bind(s.accountId)
        .first(),
    ).toEqual({ review_requested_at: '2026-06-02T09:00:00.000Z' });
    expect(
      await db
        .prepare(
          'SELECT status, is_published, permission_recorded FROM tailor WHERE id = ?',
        )
        .bind(s.tailorId)
        .first(),
    ).toEqual(before);
    expect(sent).toEqual([
      {
        reference: `TP-${s.tailorId}`,
        adminUrl: `https://example.test/admin/tailors/${s.tailorId}`,
        kind: 'tailor-ready',
      },
    ]);
    expect(notificationText(sent[0] as never)).toBe(
      `Tailor page ready for review TP-${s.tailorId}. Open it: https://example.test/admin/tailors/${s.tailorId}`,
    );
    expect(
      (await db
        .prepare(
          "SELECT count(*) AS c FROM audit_log WHERE action = 'portal_submitted' AND tailor_account_id = ?",
        )
        .bind(s.accountId)
        .first<{ c: number }>())!.c,
    ).toBe(1);
  });
  it('is refused while required items are missing, without consent, or when the page is suspended', async () => {
    const empty = await make();
    expect(await submitForReview(db, empty, options)).toEqual({
      ok: false,
      error: 'incomplete',
    });
    const noConsent = await make({ consent: false });
    await complete(noConsent);
    expect(await submitForReview(db, noConsent, options)).toEqual({
      ok: false,
      error: 'no_consent',
    });
    const paused = await make({ status: 'suspended' });
    await complete(paused);
    expect(await submitForReview(db, paused, options)).toEqual({
      ok: false,
      error: 'locked',
    });
    for (const s of [empty, noConsent, paused])
      expect(
        (await db
          .prepare(
            'SELECT review_requested_at FROM tailor_account WHERE id = ?',
          )
          .bind(s.accountId)
          .first<{ review_requested_at: string | null }>())!
          .review_requested_at,
      ).toBeNull();
  });
  it('is not held up by a failing notification sender', async () => {
    const s = await make();
    await complete(s);
    const failing = {
      siteUrl: 'https://example.test',
      notify: async () => {
        throw new Error('down');
      },
    } as never;
    expect(await submitForReview(db, s, failing)).toEqual({ ok: true });
  });
});
