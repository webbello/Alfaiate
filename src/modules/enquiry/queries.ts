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
      'SELECT display_name AS name FROM tailor WHERE slug = ? AND is_published = 1 AND permission_recorded = 1',
    )
    .bind(slug)
    .first<{ name: string }>();
  return row ? { slug, name: row.name } : null;
}

export const STATUSES = [
  'new',
  'contacted',
  'referred',
  'accepted_by_tailor',
  'completed_reported',
  'not_converted',
  'cancelled',
] as const;
export type Status = (typeof STATUSES)[number];
export const LIST_CAP = 100;

export type EnquiryRow = {
  id: number;
  reference_code: string;
  customer_name: string | null;
  contact_number_e164: string | null;
  contact_channel: string | null;
  status: Status;
  is_spam: number;
  created_at: string;
};

/** Escapes LIKE wildcards so a search for "%" or "_" matches only those characters. */
const like = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

/** Admin inbox (FR-ADM-06): newest first, spam hidden unless asked, optional status and search (reference, name or phone). */
export async function listEnquiries(
  db: D1Database,
  filters: { status?: string; q?: string; spam?: boolean } = {},
): Promise<{ rows: EnquiryRow[]; truncated: boolean }> {
  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (!filters.spam) where.push('is_spam = 0');
  const status = STATUSES.find((s) => s === filters.status);
  if (status) {
    where.push('status = ?');
    binds.push(status);
  }
  // D1 rejects LIKE patterns over 50 bytes, so cut the search until its escaped pattern fits (emoji and % cost more bytes).
  let q = (filters.q ?? '').trim();
  while (q && new TextEncoder().encode(like(q)).length > 50) q = q.slice(0, -1);
  if (q) {
    const digits = q.replace(/\D/g, '');
    const parts = [
      "reference_code LIKE ? ESCAPE '\\'",
      "customer_name LIKE ? ESCAPE '\\'",
    ];
    binds.push(like(q), like(q));
    if (digits.length >= 3) {
      parts.push("contact_number_e164 LIKE ? ESCAPE '\\'");
      binds.push(like(digits.replace(/^(00)?670/, '')));
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  const { results } = await db
    .prepare(
      `SELECT id, reference_code, customer_name, contact_number_e164, contact_channel, status, is_spam, created_at FROM enquiry
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ${LIST_CAP + 1}`,
    )
    .bind(...binds)
    .all<EnquiryRow>();
  return {
    rows: results.slice(0, LIST_CAP),
    truncated: results.length > LIST_CAP,
  };
}
