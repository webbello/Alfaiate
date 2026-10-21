import { audit, who, type Actor } from '../auth/audit';
import { can } from '../auth/permissions';
import { canEdit, getTailor } from './repo';
import { isRealDate } from './schemas';

/** "25" / "25.5" / "25.50" -> cents. Blank -> null. Anything else throws, so a typo can never become a price. */
export function dollarsToCents(input: string): number | null {
  const text = input.trim();
  if (text === '') return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) throw new Error('Not an amount');
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function centsToDollars(cents: number | null): string {
  if (cents === null) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export type CategoryEntry = {
  category_id: number;
  price_from?: string;
  price_to?: string;
  price_unit_note?: string;
  price_source?: 'tailor_supplied' | 'verified';
  price_confirmed_on?: string;
};
export type AreaEntry = { area_id: number; kind: 'shop_location' | 'serves' };
export type LinkResult =
  | { ok: true }
  | {
      ok: false;
      error:
        'invalid' | 'locked' | 'not_found' | 'inactive' | 'forbidden_source';
    };

export type TailorCategoryRow = {
  category_id: number;
  name: string;
  is_active: number;
  price_from: number | null;
  price_to: number | null;
  price_unit_note: string | null;
  price_source: 'tailor_supplied' | 'verified';
  price_confirmed_on: string | null;
};
export type TailorAreaRow = {
  area_id: number;
  name: string;
  is_active: number;
  kind: 'shop_location' | 'serves';
};

export async function getTailorCategories(
  db: D1Database,
  tailorId: number,
): Promise<TailorCategoryRow[]> {
  const { results } = await db
    .prepare(
      `SELECT tc.category_id, c.name, c.is_active, tc.price_from, tc.price_to, tc.price_unit_note, tc.price_source, tc.price_confirmed_on
       FROM tailor_category tc JOIN garment_category c ON c.id = tc.category_id WHERE tc.tailor_id = ? ORDER BY c.sort_order, c.name`,
    )
    .bind(tailorId)
    .all<TailorCategoryRow>();
  return results;
}

export async function getTailorAreas(
  db: D1Database,
  tailorId: number,
): Promise<TailorAreaRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ta.area_id, a.name, a.is_active, ta.kind FROM tailor_area ta JOIN service_area a ON a.id = ta.area_id
       WHERE ta.tailor_id = ? ORDER BY a.sort_order, a.name, ta.kind`,
    )
    .bind(tailorId)
    .all<TailorAreaRow>();
  return results;
}

async function editable(
  db: D1Database,
  role: string,
  tailorId: number,
): Promise<LinkResult> {
  const tailor = await getTailor(db, tailorId);
  if (!tailor) return { ok: false, error: 'not_found' };
  return canEdit(role, tailor) ? { ok: true } : { ok: false, error: 'locked' };
}

/** Replaces the tailor's category set. Prices come in as dollars and are stored as cents; "verified" is a manager-only claim (BR-11). */
export async function setCategories(
  db: D1Database,
  actorId: Actor,
  role: string,
  tailorId: number,
  entries: CategoryEntry[],
): Promise<LinkResult> {
  const allowed = await editable(db, role, tailorId);
  if (!allowed.ok) return allowed;
  if (new Set(entries.map((e) => e.category_id)).size !== entries.length)
    return { ok: false, error: 'invalid' };

  const existing = new Map(
    (await getTailorCategories(db, tailorId)).map((r) => [r.category_id, r]),
  );
  const known = new Map(
    (
      await db
        .prepare('SELECT id, is_active FROM garment_category')
        .all<{ id: number; is_active: number }>()
    ).results.map((r) => [r.id, r.is_active]),
  );
  const mayVerify = can(role, 'tailor.publish');

  const statements: D1PreparedStatement[] = [];
  for (const entry of entries) {
    if (!known.has(entry.category_id)) return { ok: false, error: 'invalid' };
    const before = existing.get(entry.category_id);
    if (!known.get(entry.category_id) && !before)
      return { ok: false, error: 'inactive' };

    let from: number | null, to: number | null;
    try {
      from = dollarsToCents(entry.price_from ?? '');
      to = dollarsToCents(entry.price_to ?? '');
    } catch {
      return { ok: false, error: 'invalid' };
    }
    if (from !== null && to !== null && to < from)
      return { ok: false, error: 'invalid' };
    const confirmed = entry.price_confirmed_on?.trim() || null;
    if (
      confirmed !== null &&
      !(/^\d{4}-\d{2}-\d{2}$/.test(confirmed) && isRealDate(confirmed))
    )
      return { ok: false, error: 'invalid' };
    const note = entry.price_unit_note?.trim() || null;
    if (note !== null && note.length > 100)
      return { ok: false, error: 'invalid' };

    const unchangedVerified =
      before?.price_source === 'verified' &&
      before.price_from === from &&
      before.price_to === to;
    const source =
      entry.price_source ??
      (unchangedVerified ? 'verified' : 'tailor_supplied');
    if (source === 'verified' && !mayVerify && !unchangedVerified)
      return { ok: false, error: 'forbidden_source' };

    statements.push(
      db
        .prepare(
          `INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to, price_unit_note, price_source, price_confirmed_on) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (tailor_id, category_id) DO UPDATE SET price_from = excluded.price_from, price_to = excluded.price_to, price_unit_note = excluded.price_unit_note,
             price_source = excluded.price_source, price_confirmed_on = excluded.price_confirmed_on, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        )
        .bind(tailorId, entry.category_id, from, to, note, source, confirmed),
    );
  }
  const keep = entries.map((e) => e.category_id);
  const marks = keep.map(() => '?').join(', ');
  statements.unshift(
    db
      .prepare(
        `DELETE FROM tailor_category WHERE tailor_id = ?${keep.length ? ` AND category_id NOT IN (${marks})` : ''}`,
      )
      .bind(tailorId, ...keep),
  );
  await db.batch(statements);
  await audit(db, {
    ...who(actorId),
    action: 'tailor_updated',
    entityType: 'tailor',
    entityId: tailorId,
  });
  return { ok: true };
}

/** Replaces the tailor's shop-location and served-area links. */
export async function setAreas(
  db: D1Database,
  actorId: Actor,
  role: string,
  tailorId: number,
  entries: AreaEntry[],
): Promise<LinkResult> {
  const allowed = await editable(db, role, tailorId);
  if (!allowed.ok) return allowed;
  const keys = entries.map((e) => `${e.area_id}:${e.kind}`);
  if (new Set(keys).size !== keys.length)
    return { ok: false, error: 'invalid' };

  const existing = new Set(
    (await getTailorAreas(db, tailorId)).map((r) => `${r.area_id}:${r.kind}`),
  );
  const known = new Map(
    (
      await db
        .prepare('SELECT id, is_active FROM service_area')
        .all<{ id: number; is_active: number }>()
    ).results.map((r) => [r.id, r.is_active]),
  );
  for (const entry of entries) {
    if (
      !['shop_location', 'serves'].includes(entry.kind) ||
      !known.has(entry.area_id)
    )
      return { ok: false, error: 'invalid' };
    if (
      !known.get(entry.area_id) &&
      !existing.has(`${entry.area_id}:${entry.kind}`)
    )
      return { ok: false, error: 'inactive' };
  }
  await db.batch([
    db.prepare('DELETE FROM tailor_area WHERE tailor_id = ?').bind(tailorId),
    ...entries.map((e) =>
      db
        .prepare(
          'INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, ?)',
        )
        .bind(tailorId, e.area_id, e.kind),
    ),
  ]);
  await audit(db, {
    ...who(actorId),
    action: 'tailor_updated',
    entityType: 'tailor',
    entityId: tailorId,
  });
  return { ok: true };
}
