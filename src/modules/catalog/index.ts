import { z } from 'zod';
import { audit } from '../auth/audit';
import { uniqueSlug } from '../db/unique-slug';

// Categories and areas share one implementation; `kind` picks the table from a whitelist, never from user text.
const TABLE = { category: 'garment_category', area: 'service_area' } as const;
export type Kind = keyof typeof TABLE;

export type Entry = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: number;
};
export type Outcome =
  { ok: true } | { ok: false; error: 'invalid' | 'not_found' };

const input = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
});
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

function table(kind: Kind) {
  const name = TABLE[kind];
  if (!name) throw new Error('Unknown catalog kind');
  return name;
}

export async function listEntries(
  db: D1Database,
  kind: Kind,
  { onlyActive = false } = {},
): Promise<Entry[]> {
  const t = table(kind);
  const description =
    kind === 'category' ? 'description' : 'NULL AS description';
  const where = onlyActive ? 'WHERE is_active = 1' : '';
  const { results } = await db
    .prepare(
      `SELECT id, slug, name, ${description}, sort_order, is_active FROM ${t} ${where} ORDER BY sort_order, name`,
    )
    .all<Entry>();
  return results;
}

export async function createEntry(
  db: D1Database,
  actorId: number,
  kind: Kind,
  data: { name: string; description?: string },
): Promise<{ ok: true; id: number } | { ok: false; error: 'invalid' }> {
  const parsed = input.safeParse(data);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const t = table(kind);
  const slug = await uniqueSlug(db, t, parsed.data.name);
  const next = (await db
    .prepare(`SELECT coalesce(max(sort_order), 0) + 1 AS n FROM ${t}`)
    .first<{ n: number }>())!.n;
  const created =
    kind === 'category'
      ? await db
          .prepare(
            'INSERT INTO garment_category (slug, name, description, sort_order) VALUES (?, ?, ?, ?)',
          )
          .bind(slug, parsed.data.name, parsed.data.description ?? null, next)
          .run()
      : await db
          .prepare(
            'INSERT INTO service_area (slug, name, sort_order) VALUES (?, ?, ?)',
          )
          .bind(slug, parsed.data.name, next)
          .run();
  await audit(db, {
    userId: actorId,
    action: 'catalog_changed',
    entityType: t,
    entityId: created.meta.last_row_id,
  });
  return { ok: true, id: created.meta.last_row_id };
}

async function change(
  db: D1Database,
  actorId: number,
  kind: Kind,
  id: number,
  sql: string,
  binds: unknown[],
): Promise<Outcome> {
  const result = await db
    .prepare(sql)
    .bind(...binds, id)
    .run();
  if (result.meta.changes === 0) return { ok: false, error: 'not_found' };
  await audit(db, {
    userId: actorId,
    action: 'catalog_changed',
    entityType: table(kind),
    entityId: id,
  });
  return { ok: true };
}

/** The slug never changes after creation, so URLs and links stay stable. */
export async function renameEntry(
  db: D1Database,
  actorId: number,
  kind: Kind,
  id: number,
  data: { name: string; description?: string },
): Promise<Outcome> {
  const parsed = input.safeParse(data);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const t = table(kind);
  return kind === 'category'
    ? change(
        db,
        actorId,
        kind,
        id,
        `UPDATE ${t} SET name = ?, description = ?, updated_at = ${NOW} WHERE id = ?`,
        [parsed.data.name, parsed.data.description ?? null],
      )
    : change(
        db,
        actorId,
        kind,
        id,
        `UPDATE ${t} SET name = ?, updated_at = ${NOW} WHERE id = ?`,
        [parsed.data.name],
      );
}

export function setOrder(
  db: D1Database,
  actorId: number,
  kind: Kind,
  id: number,
  sortOrder: number,
): Promise<Outcome> {
  if (!Number.isInteger(sortOrder))
    return Promise.resolve({ ok: false, error: 'invalid' });
  return change(
    db,
    actorId,
    kind,
    id,
    `UPDATE ${table(kind)} SET sort_order = ?, updated_at = ${NOW} WHERE id = ?`,
    [sortOrder],
  );
}

export function setActive(
  db: D1Database,
  actorId: number,
  kind: Kind,
  id: number,
  active: boolean,
): Promise<Outcome> {
  return change(
    db,
    actorId,
    kind,
    id,
    `UPDATE ${table(kind)} SET is_active = ?, updated_at = ${NOW} WHERE id = ?`,
    [active ? 1 : 0],
  );
}
