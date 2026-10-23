import { slugify } from '../tailors/slug';

const TABLES = [
  'tailor',
  'garment_category',
  'service_area',
  'product',
] as const;
export type SlugTable = (typeof TABLES)[number];

/** Slug from a name that is not yet used in `table`: appends -2, -3, ... when needed. The table is checked against a whitelist. */
export async function uniqueSlug(
  db: D1Database,
  table: SlugTable,
  name: string,
): Promise<string> {
  if (!TABLES.includes(table)) throw new Error('Unknown table');
  const base = slugify(name, table === 'product' ? 'product' : 'tailor');
  for (let suffix = 1; ; suffix++) {
    const tail = suffix === 1 ? '' : `-${suffix}`;
    // the stored slug is at most 60 characters: leave room for the number
    const candidate = `${base.slice(0, 60 - tail.length).replace(/-+$/, '')}${tail}`;
    if (
      !(await db
        .prepare(`SELECT 1 FROM ${table} WHERE slug = ?`)
        .bind(candidate)
        .first())
    )
      return candidate;
  }
}
