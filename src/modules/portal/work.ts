import { listEntries } from '../catalog';
import {
  centsToDollars,
  getTailorAreas,
  getTailorCategories,
  setAreas,
  setCategories,
  type AreaEntry,
  type CategoryEntry,
  type LinkResult,
} from '../tailors/links';
import { getTailor } from '../tailors/repo';
import { tailorMayEdit } from './profile';
import type { TailorSession } from './session';

export async function workView(db: D1Database, tailorId: number) {
  const [categories, areas, links, areaLinks] = await Promise.all([
    listEntries(db, 'category', { onlyActive: true }),
    listEntries(db, 'area', { onlyActive: true }),
    getTailorCategories(db, tailorId),
    getTailorAreas(db, tailorId),
  ]);
  return {
    categories,
    areas,
    chosen: new Set(links.map((l) => l.category_id)),
    shop: new Set(
      areaLinks.filter((a) => a.kind === 'shop_location').map((a) => a.area_id),
    ),
    serves: new Set(
      areaLinks.filter((a) => a.kind === 'serves').map((a) => a.area_id),
    ),
  };
}

/**
 * Saves the ticked work types and areas (FR-TPO-04). Tick boxes only: prices on existing links are carried over unchanged
 * (a verified price stays verified), a tailor cannot mark anything verified, and a link to a type or area the owner has since switched off is kept.
 */
export async function saveWork(
  db: D1Database,
  session: TailorSession,
  form: FormData,
): Promise<LinkResult> {
  const tailor = await getTailor(db, session.tailorId);
  if (!tailor) return { ok: false, error: 'not_found' };
  if (!tailorMayEdit(tailor.status)) return { ok: false, error: 'locked' };
  const actor = { tailorAccountId: session.accountId };

  const [active, activeAreas, links, areaLinks] = await Promise.all([
    listEntries(db, 'category', { onlyActive: true }),
    listEntries(db, 'area', { onlyActive: true }),
    getTailorCategories(db, session.tailorId),
    getTailorAreas(db, session.tailorId),
  ]);
  const have = new Map(links.map((l) => [l.category_id, l]));
  const activeIds = new Set(active.map((c) => c.id));
  const categories: CategoryEntry[] = [
    ...active.filter((c) => form.get(`cat_${c.id}`) === 'on').map((c) => c.id),
    ...links
      .filter((l) => !activeIds.has(l.category_id))
      .map((l) => l.category_id),
  ].map((id) => {
    const before = have.get(id);
    return before
      ? {
          category_id: id,
          price_from: centsToDollars(before.price_from),
          price_to: centsToDollars(before.price_to),
          price_unit_note: before.price_unit_note ?? undefined,
          price_confirmed_on: before.price_confirmed_on ?? undefined,
          price_source: before.price_source,
        }
      : { category_id: id };
  });
  const activeAreaIds = new Set(activeAreas.map((a) => a.id));
  const areas: AreaEntry[] = [
    ...activeAreas.flatMap((a): AreaEntry[] => [
      ...(form.get(`shop_${a.id}`) === 'on'
        ? [{ area_id: a.id, kind: 'shop_location' as const }]
        : []),
      ...(form.get(`serves_${a.id}`) === 'on'
        ? [{ area_id: a.id, kind: 'serves' as const }]
        : []),
    ]),
    ...areaLinks
      .filter((a) => !activeAreaIds.has(a.area_id))
      .map((a) => ({ area_id: a.area_id, kind: a.kind })),
  ];
  // Same lock and validation as the owner's screens; the role only passes that lock, the tick-only input above decides what can change.
  const first = await setCategories(
    db,
    actor,
    'manager',
    session.tailorId,
    categories,
  );
  if (!first.ok) return first;
  return setAreas(db, actor, 'manager', session.tailorId, areas);
}
