import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  INVITE_DAYS,
  consumeInvite,
  issueInvite,
  lookupInvite,
} from '../../src/modules/portal/invite';
import {
  approveInterest,
  declineInterest,
  reissueInvite,
} from '../../src/modules/portal/approve';

const db = env.DB;
let n = 0;
const T0 = new Date('2026-06-01T09:00:00.000Z');
const admin = async () =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(`pi${++n}@example.test`, 'x', 'manager')
      .run()
  ).meta.last_row_id;
const interest = async (
  o: { business?: string | null; anonymised?: boolean } = {},
) => {
  const ref = `JN-TEST${String(++n).padStart(4, '0')}`;
  await db
    .prepare(
      `INSERT INTO tailor_interest (reference_code, contact_name, business_name, phone_e164, consent_contact, consent_text_version, consent_at, anonymised_at) VALUES (?, ?, ?, ?, 1, 'v', 'now', ?)`,
    )
    .bind(
      ref,
      o.anonymised ? null : 'Fake Person',
      o.anonymised
        ? null
        : o.business === undefined
          ? 'Fake Atelier'
          : o.business,
      o.anonymised ? null : '+67077123456',
      o.anonymised ? 'now' : null,
    )
    .run();
  return (await db
    .prepare('SELECT id FROM tailor_interest WHERE reference_code = ?')
    .bind(ref)
    .first<{ id: number }>())!.id;
};
const activation = (e: string) => ({
  email: e,
  passwordHash: 'pbkdf2-fake',
  consentVersion: 'v1',
});

describe('approveInterest (FR-TPO-01)', () => {
  it('makes one draft tailor, one account without a password, and a working one-time invite', async () => {
    const actor = await admin();
    const id = await interest();
    const r = await approveInterest(db, { id, actorId: actor }, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = await db
      .prepare(
        'SELECT display_name, status, is_published, whatsapp_e164, phone_e164, private_contact_name, private_phone FROM tailor WHERE id = ?',
      )
      .bind(r.tailorId)
      .first();
    expect(t).toEqual({
      display_name: 'Fake Atelier',
      status: 'draft',
      is_published: 0,
      whatsapp_e164: null,
      phone_e164: null,
      private_contact_name: 'Fake Person',
      private_phone: '+67077123456',
    });
    const a = await db
      .prepare('SELECT email, password_hash FROM tailor_account WHERE id = ?')
      .bind(r.accountId)
      .first();
    expect(a).toEqual({ email: null, password_hash: null });
    expect(await lookupInvite(db, r.token, T0)).toMatchObject({
      tailorId: r.tailorId,
      name: 'Fake Atelier',
    });
    const row = await db
      .prepare('SELECT decision, tailor_id FROM tailor_interest WHERE id = ?')
      .bind(id)
      .first();
    expect(row).toEqual({ decision: 'approved', tailor_id: r.tailorId });
    const logged = await db
      .prepare(
        "SELECT count(*) AS c FROM audit_log WHERE action IN ('interest_approved','tailor_invite_issued') AND admin_user_id = ?",
      )
      .bind(actor)
      .first<{ c: number }>();
    expect(logged!.c).toBe(2);
  });
  it('falls back to the contact name, and approves only once', async () => {
    const actor = await admin();
    const id = await interest({ business: null });
    const first = await approveInterest(db, { id, actorId: actor }, T0);
    expect(
      first.ok &&
        (await db
          .prepare('SELECT display_name FROM tailor WHERE id = ?')
          .bind(first.tailorId)
          .first()),
    ).toEqual({ display_name: 'Fake Person' });
    expect(await approveInterest(db, { id, actorId: actor }, T0)).toEqual({
      ok: false,
      reason: 'already_decided',
    });
    expect(
      (await db
        .prepare('SELECT count(*) AS c FROM tailor_account WHERE tailor_id = ?')
        .bind(first.ok ? first.tailorId : 0)
        .first<{ c: number }>())!.c,
    ).toBe(1);
  });
  it('refuses unknown, declined and anonymised requests and creates nothing for them', async () => {
    const actor = await admin();
    const before = (await db
      .prepare('SELECT count(*) AS c FROM tailor')
      .first<{ c: number }>())!.c;
    expect(await approveInterest(db, { id: 99999999, actorId: actor })).toEqual(
      { ok: false, reason: 'not_found' },
    );
    expect(
      await approveInterest(db, {
        id: await interest({ anonymised: true }),
        actorId: actor,
      }),
    ).toEqual({ ok: false, reason: 'anonymised' });
    const d = await interest();
    expect(await declineInterest(db, { id: d, actorId: actor })).toBe('ok');
    expect(await approveInterest(db, { id: d, actorId: actor })).toEqual({
      ok: false,
      reason: 'already_decided',
    });
    expect(
      (await db
        .prepare('SELECT count(*) AS c FROM tailor')
        .first<{ c: number }>())!.c,
    ).toBe(before);
  });
  it('declines once and audits it', async () => {
    const actor = await admin();
    const id = await interest();
    expect(await declineInterest(db, { id, actorId: actor })).toBe('ok');
    expect(await declineInterest(db, { id, actorId: actor })).toBe(
      'already_decided',
    );
    expect(await declineInterest(db, { id: 99999999, actorId: actor })).toBe(
      'not_found',
    );
  });
});

describe('invite tokens (FR-TPO-02)', () => {
  const fresh = async () => {
    const r = await approveInterest(
      db,
      { id: await interest(), actorId: await admin() },
      T0,
    );
    if (!r.ok) throw new Error('setup');
    return r;
  };
  it('are stored only as a hash', async () => {
    const r = await fresh();
    const rows = await db
      .prepare('SELECT token_hash FROM tailor_invite')
      .all<{ token_hash: string }>();
    expect(rows.results.some((x) => x.token_hash === r.token)).toBe(false);
  });
  it('work once: the account gets its email, password and consent, and a second use is refused', async () => {
    const r = await fresh();
    const ok = await consumeInvite(
      db,
      r.token,
      activation(`first${++n}@example.test`),
      T0,
    );
    expect(ok).toEqual({
      ok: true,
      accountId: r.accountId,
      tailorId: r.tailorId,
    });
    const a = await db
      .prepare(
        'SELECT email, password_hash, consent_version, consent_at FROM tailor_account WHERE id = ?',
      )
      .bind(r.accountId)
      .first();
    expect(a).toMatchObject({
      password_hash: 'pbkdf2-fake',
      consent_version: 'v1',
      consent_at: T0.toISOString(),
    });
    expect(
      await consumeInvite(
        db,
        r.token,
        activation(`second${n}@example.test`),
        T0,
      ),
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(await lookupInvite(db, r.token, T0)).toBeNull();
  });
  it('expire after the set days', async () => {
    const r = await fresh();
    const late = new Date(T0.getTime() + INVITE_DAYS * 86_400_000 + 1000);
    expect(await lookupInvite(db, r.token, late)).toBeNull();
    expect(
      await consumeInvite(
        db,
        r.token,
        activation(`late${++n}@example.test`),
        late,
      ),
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(
      await lookupInvite(db, r.token, new Date(T0.getTime() + 86_400_000)),
    ).not.toBeNull();
  });
  it('are replaced by a re-issued link, and an unknown or empty token never works', async () => {
    const r = await fresh();
    const again = await reissueInvite(
      db,
      { tailorId: r.tailorId, actorId: await admin() },
      T0,
    );
    expect(again).not.toBeNull();
    expect(await lookupInvite(db, r.token, T0)).toBeNull();
    expect(await lookupInvite(db, again!.token, T0)).not.toBeNull();
    expect(await lookupInvite(db, '', T0)).toBeNull();
    expect(await lookupInvite(db, 'not-a-token', T0)).toBeNull();
    expect(
      await reissueInvite(db, { tailorId: 99999999, actorId: 1 }, T0),
    ).toBeNull();
  });
  it('are refused for a deactivated account, and a taken email does not use up the link', async () => {
    const r = await fresh();
    await db
      .prepare('UPDATE tailor_account SET is_active = 0 WHERE id = ?')
      .bind(r.accountId)
      .run();
    expect(await lookupInvite(db, r.token, T0)).toBeNull();
    await db
      .prepare('UPDATE tailor_account SET is_active = 1 WHERE id = ?')
      .bind(r.accountId)
      .run();
    const other = await fresh();
    const email = `taken${++n}@example.test`;
    expect(
      (await consumeInvite(db, other.token, activation(email), T0)).ok,
    ).toBe(true);
    expect(await consumeInvite(db, r.token, activation(email), T0)).toEqual({
      ok: false,
      reason: 'email_taken',
    });
    expect(await lookupInvite(db, r.token, T0)).not.toBeNull();
  });
  it('can be issued again after use (password reset), and then work once more', async () => {
    const r = await fresh();
    await consumeInvite(
      db,
      r.token,
      activation(`reset${++n}@example.test`),
      T0,
    );
    const again = await issueInvite(db, r.accountId, T0);
    expect(
      (await consumeInvite(db, again, activation(`reset${n}@example.test`), T0))
        .ok,
    ).toBe(true);
  });
});
