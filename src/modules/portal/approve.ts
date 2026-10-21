import { audit } from '../auth/audit';
import { createDraft } from '../tailors/repo';
import { issueInvite } from './invite';

export type ApproveResult =
  | { ok: true; tailorId: number; accountId: number; token: string }
  | {
      ok: false;
      reason: 'not_found' | 'anonymised' | 'already_decided' | 'failed';
    };

type Interest = {
  id: number;
  contact_name: string | null;
  business_name: string | null;
  phone_e164: string | null;
  decision: string;
  anonymised_at: string | null;
};

/**
 * The owner's "Approve" on a join request (FR-TPO-01): creates one draft tailor (never published, no public number), one sign-in account
 * without a password, and a one-time invite. The decision is claimed first (only while still pending), so a double click or two admins cannot make two tailors.
 */
export async function approveInterest(
  db: D1Database,
  input: { id: number; actorId: number },
  now = new Date(),
): Promise<ApproveResult> {
  const interest = await db
    .prepare(
      'SELECT id, contact_name, business_name, phone_e164, decision, anonymised_at FROM tailor_interest WHERE id = ?',
    )
    .bind(input.id)
    .first<Interest>();
  if (!interest) return { ok: false, reason: 'not_found' };
  if (interest.anonymised_at) return { ok: false, reason: 'anonymised' };
  const stamp = now.toISOString();
  const claim = await db
    .prepare(
      "UPDATE tailor_interest SET decision = 'approved', decided_at = ? WHERE id = ? AND decision = 'pending' AND anonymised_at IS NULL",
    )
    .bind(stamp, input.id)
    .run();
  if (claim.meta.changes !== 1) return { ok: false, reason: 'already_decided' };
  try {
    const name = (interest.business_name || interest.contact_name || '').trim();
    const draft = await createDraft(db, input.actorId, {
      display_name: name,
      private_contact_name: interest.contact_name ?? undefined,
      private_phone: interest.phone_e164 ?? undefined,
    });
    if (!draft.ok) throw new Error('draft');
    const account = await db
      .prepare('INSERT INTO tailor_account (tailor_id) VALUES (?)')
      .bind(draft.id)
      .run();
    const accountId = account.meta.last_row_id;
    await db
      .prepare('UPDATE tailor_interest SET tailor_id = ? WHERE id = ?')
      .bind(draft.id, input.id)
      .run();
    const token = await issueInvite(db, accountId, now);
    await audit(db, {
      userId: input.actorId,
      action: 'interest_approved',
      entityType: 'tailor_interest',
      entityId: input.id,
    });
    await audit(db, {
      userId: input.actorId,
      action: 'tailor_invite_issued',
      entityType: 'tailor',
      entityId: draft.id,
    });
    return { ok: true, tailorId: draft.id, accountId, token };
  } catch {
    // Give the decision back so the owner can try again; nothing half-made is left pending.
    await db
      .prepare(
        "UPDATE tailor_interest SET decision = 'pending', decided_at = NULL WHERE id = ?",
      )
      .bind(input.id)
      .run();
    return { ok: false, reason: 'failed' };
  }
}

export type DeclineResult = 'ok' | 'not_found' | 'already_decided';

export async function declineInterest(
  db: D1Database,
  input: { id: number; actorId: number },
  now = new Date(),
): Promise<DeclineResult> {
  const exists = await db
    .prepare('SELECT 1 FROM tailor_interest WHERE id = ?')
    .bind(input.id)
    .first();
  if (!exists) return 'not_found';
  const result = await db
    .prepare(
      "UPDATE tailor_interest SET decision = 'declined', decided_at = ? WHERE id = ? AND decision = 'pending'",
    )
    .bind(now.toISOString(), input.id)
    .run();
  if (result.meta.changes !== 1) return 'already_decided';
  await audit(db, {
    userId: input.actorId,
    action: 'interest_declined',
    entityType: 'tailor_interest',
    entityId: input.id,
  });
  return 'ok';
}

/** A new link for an existing tailor account (lost link, expired link, or a forgotten password). Replaces any unused older link. */
export async function reissueInvite(
  db: D1Database,
  input: { tailorId: number; actorId: number },
  now = new Date(),
): Promise<{ token: string } | null> {
  const account = await db
    .prepare(
      'SELECT id FROM tailor_account WHERE tailor_id = ? AND is_active = 1',
    )
    .bind(input.tailorId)
    .first<{ id: number }>();
  if (!account) return null;
  const token = await issueInvite(db, account.id, now);
  await audit(db, {
    userId: input.actorId,
    action: 'tailor_invite_issued',
    entityType: 'tailor',
    entityId: input.tailorId,
  });
  return { token };
}

/** Switches a tailor's sign-in off (they left, or a session or password may be stolen) or back on. Switching off ends every session at once. */
export async function setTailorSignIn(
  db: D1Database,
  input: { tailorId: number; actorId: number; active: boolean },
): Promise<boolean> {
  const account = await db
    .prepare('SELECT id FROM tailor_account WHERE tailor_id = ?')
    .bind(input.tailorId)
    .first<{ id: number }>();
  if (!account) return false;
  await db.batch([
    db
      .prepare(
        "UPDATE tailor_account SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      )
      .bind(input.active ? 1 : 0, account.id),
    ...(input.active
      ? []
      : [
          db
            .prepare('DELETE FROM tailor_session WHERE tailor_account_id = ?')
            .bind(account.id),
        ]),
  ]);
  await audit(db, {
    userId: input.actorId,
    action: input.active
      ? 'tailor_signin_activated'
      : 'tailor_signin_deactivated',
    entityType: 'tailor',
    entityId: input.tailorId,
  });
  return true;
}
