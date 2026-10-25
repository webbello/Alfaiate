import { can } from '../auth/permissions';

export type Counter = {
  key: 'new' | 'join' | 'review' | 'orders';
  count: number;
  label: string;
  href: string;
};

// Dili is UTC+9 all year, so "today" for shop orders is the Dili day, not the UTC one (FR-ADM-10).
const DILI = "'+9 hours'";

const n = async (db: D1Database, sql: string) =>
  (await db.prepare(sql).first<{ n: number }>())?.n ?? 0;

/**
 * The four numbers at the top of the dashboard (FR-ADM-10), each a link to its list. Zero is shown (a quiet day is information),
 * but a counter is left out when the role may not open its list. Counts only: no names, numbers or notes.
 */
export async function dashboardCounters(
  db: D1Database,
  role: string,
): Promise<Counter[]> {
  const counters: Counter[] = [];
  if (can(role, 'enquiry.view')) {
    counters.push(
      {
        key: 'new',
        label: 'New requests',
        count: await n(
          db,
          "SELECT count(*) AS n FROM enquiry WHERE status = 'new' AND is_spam = 0",
        ),
        href: '/admin/enquiries?status=new',
      },
      {
        key: 'join',
        label: 'Join requests',
        count: await n(
          db,
          "SELECT count(*) AS n FROM tailor_interest WHERE decision = 'pending' AND anonymised_at IS NULL",
        ),
        href: '/admin/interest',
      },
    );
  }
  if (can(role, 'tailor.edit'))
    counters.push({
      key: 'review',
      label: 'Ready to publish',
      count: await n(
        db,
        'SELECT count(*) AS n FROM tailor_account a JOIN tailor t ON t.id = a.tailor_id WHERE a.review_requested_at IS NOT NULL AND t.is_published = 0',
      ),
      href: '/admin/tailors?published=0',
    });
  if (can(role, 'enquiry.view'))
    counters.push({
      key: 'orders',
      label: 'Orders today',
      count: await n(
        db,
        `SELECT count(*) AS n FROM shop_order WHERE date(created_at, ${DILI}) = date('now', ${DILI})`,
      ),
      href: '/admin/orders',
    });
  return counters;
}
