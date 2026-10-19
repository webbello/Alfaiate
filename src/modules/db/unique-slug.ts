import { slugify } from '../tailors/slug';

const TABLES = ['tailor', 'garment_category', 'service_area'] as const;
export type SlugTable = (typeof TABLES)[number];

/** Slug from a name that is not yet used in `table`: appends -2, -3, ... when needed. The table is checked against a whitelist. */
export async function uniqueSlug(
  db: D1Database,
  table: SlugTable,
  name: string,
): Promise<string> {
  if (!TABLES.includes(table)) throw new Error('Unknown table');
  const base = slugify(name);
  for (let suffix = 1; ; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if (
      !(await db
        .prepare(`SELECT 1 FROM ${table} WHERE slug = ?`)
        .bind(candidate)
        .first())
    )
      return candidate;
  }
}
