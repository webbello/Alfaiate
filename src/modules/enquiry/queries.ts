import { fitLike, likeAnywhere } from '../db/like';
export type Choice = { id: number; name: string };

/** Active categories and areas for the request form (ids, because the form posts ids and the server re-checks them). */
export async function formChoices(db: D1Database): Promise<{
  categories: (Choice & { slug: string })[];
  areas: Choice[];
}> {
  const [categories, areas] = await db.batch<Choice & { slug: string }>([
    db.prepare(
      'SELECT id, name, slug FROM garment_category WHERE is_active = 1 ORDER BY sort_order, name',
    ),
    db.prepare(
      'SELECT id, name FROM service_area WHERE is_active = 1 ORDER BY sort_order, name',
    ),
  ]);
  return { categories: categories.results, areas: areas.results };
}

/** The published tailors among these slugs, by name, in the order given. */
export async function alsoTailors(
  db: D1Database,
  slugs: string[],
): Promise<{ slug: string; name: string }[]> {
  const found = await Promise.all(slugs.map((s) => preselectedTailor(db, s)));
  return found.filter((t): t is { slug: string; name: string } => t !== null);
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
  /** Where the request came from: form, profile:<slug>, business or shop. */
  source: string | null;
  /** The active referral's response, else the latest outcome, else null (not passed to a tailor yet). */
  referral_state: 'pending' | 'accepted' | 'declined' | 'no_response' | null;
};

/** Admin inbox (FR-ADM-06): New requests first and oldest first (FR-ADM-12), then the rest newest first, spam hidden unless asked, optional status and search (reference, name or phone). */
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
  const q = fitLike(filters.q ?? '');
  if (q) {
    const digits = q.replace(/\D/g, '');
    const parts = [
      "reference_code LIKE ? ESCAPE '\\'",
      "customer_name LIKE ? ESCAPE '\\'",
    ];
    binds.push(likeAnywhere(q), likeAnywhere(q));
    if (digits.length >= 3) {
      parts.push("contact_number_e164 LIKE ? ESCAPE '\\'");
      binds.push(likeAnywhere(digits.replace(/^(00)?670/, '')));
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  const { results } = await db
    .prepare(
      `SELECT id, reference_code, customer_name, contact_number_e164, contact_channel, status, is_spam, created_at, source,
              (SELECT r.tailor_response FROM referral r WHERE r.enquiry_id = enquiry.id
               ORDER BY (r.tailor_response IN ('pending', 'accepted')) DESC, r.id DESC LIMIT 1) AS referral_state
       FROM enquiry
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY (status = 'new') DESC, CASE WHEN status = 'new' THEN created_at END ASC, created_at DESC, id DESC LIMIT ${LIST_CAP + 1}`,
    )
    .bind(...binds)
    .all<EnquiryRow>();
  return {
    rows: results.slice(0, LIST_CAP),
    truncated: results.length > LIST_CAP,
  };
}

/** How many enquiries have each status (spam left out), and the total: for the filter chips on the inbox. */
export async function countByStatus(
  db: D1Database,
): Promise<{ byStatus: Record<Status, number>; total: number }> {
  const { results } = await db
    .prepare(
      'SELECT status, count(*) AS c FROM enquiry WHERE is_spam = 0 GROUP BY status',
    )
    .all<{ status: Status; c: number }>();
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
    Status,
    number
  >;
  for (const row of results) byStatus[row.status] = row.c;
  return {
    byStatus,
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
  };
}
