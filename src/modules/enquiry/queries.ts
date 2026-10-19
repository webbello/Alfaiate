export type Choice = { id: number; name: string };

/** Active categories and areas for the request form (ids, because the form posts ids and the server re-checks them). */
export async function formChoices(
  db: D1Database,
): Promise<{ categories: Choice[]; areas: Choice[] }> {
  const [categories, areas] = await db.batch<Choice>([
    db.prepare(
      'SELECT id, name FROM garment_category WHERE is_active = 1 ORDER BY sort_order, name',
    ),
    db.prepare(
      'SELECT id, name FROM service_area WHERE is_active = 1 ORDER BY sort_order, name',
    ),
  ]);
  return { categories: categories.results, areas: areas.results };
}

/** The tailor a request was started from, by name, only if published. */
export async function preselectedTailor(
  db: D1Database,
  slug: string | null,
): Promise<{ slug: string; name: string } | null> {
  if (!slug) return null;
  const row = await db
    .prepare(
      'SELECT display_name AS name FROM tailor WHERE slug = ? AND is_published = 1',
    )
    .bind(slug)
    .first<{ name: string }>();
  return row ? { slug, name: row.name } : null;
}
