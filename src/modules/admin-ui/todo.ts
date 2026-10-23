import { can } from '../auth/permissions';

export type TodoItem = {
  key: 'new' | 'join' | 'review' | 'waiting' | 'fees';
  count: number;
  /** The sentence, with the number already in it. */
  label: string;
  /** What to do about it, in one line. */
  help: string;
  href: string;
  cta: string;
};

const n = async (db: D1Database, sql: string) =>
  (await db.prepare(sql).first<{ n: number }>())?.n ?? 0;
const plural = (c: number, one: string, many: string) => (c === 1 ? one : many);

/**
 * What needs the owner's attention right now, for the dashboard: only items the role may act on, only those above zero.
 * Counts only, never names or numbers, so it can sit on the first screen. Spam is left out.
 */
export async function todoItems(
  db: D1Database,
  role: string,
): Promise<TodoItem[]> {
  const items: TodoItem[] = [];
  if (can(role, 'enquiry.view')) {
    const fresh = await n(
      db,
      "SELECT count(*) AS n FROM enquiry WHERE status = 'new' AND is_spam = 0",
    );
    if (fresh > 0)
      items.push({
        key: 'new',
        count: fresh,
        label: `${fresh} new ${plural(fresh, 'enquiry', 'enquiries')} to answer`,
        help: 'Contact the customer, then pass the request to a tailor.',
        href: '/admin/enquiries?status=new',
        cta: 'Open enquiries',
      });
    const join = await n(
      db,
      "SELECT count(*) AS n FROM tailor_interest WHERE decision = 'pending' AND anonymised_at IS NULL",
    );
    if (join > 0)
      items.push({
        key: 'join',
        count: join,
        label: `${join} tailor ${plural(join, 'request', 'requests')} to join, waiting for your decision`,
        help: 'Approve to create their page and a sign-in link, or decline.',
        href: '/admin/interest',
        cta: 'Review requests',
      });
    const waiting = await n(
      db,
      "SELECT count(*) AS n FROM referral r JOIN enquiry e ON e.id = r.enquiry_id WHERE r.tailor_response IN ('pending', 'no_response') AND e.status = 'referred' AND e.is_spam = 0",
    );
    if (waiting > 0)
      items.push({
        key: 'waiting',
        count: waiting,
        label: `${waiting} ${plural(waiting, 'referral', 'referrals')} waiting for a tailor to reply`,
        help: 'Follow up with the tailor, then record their answer.',
        href: '/admin/enquiries?status=referred',
        cta: 'See referred enquiries',
      });
  }
  if (can(role, 'tailor.edit')) {
    const review = await n(
      db,
      'SELECT count(*) AS n FROM tailor_account a JOIN tailor t ON t.id = a.tailor_id WHERE a.review_requested_at IS NOT NULL AND t.is_published = 0',
    );
    if (review > 0)
      items.push({
        key: 'review',
        count: review,
        label: `${review} tailor ${plural(review, 'page', 'pages')} ready for your review`,
        help: 'Check the details and photos, record permission, then publish.',
        href: '/admin/tailors?published=0',
        cta: 'Review pages',
      });
  }
  if (can(role, 'fee.view')) {
    const fees = await n(
      db,
      "SELECT count(*) AS n FROM referral WHERE fee_status IN ('due', 'disputed')",
    );
    if (fees > 0)
      items.push({
        key: 'fees',
        count: fees,
        label: `${fees} ${plural(fees, 'fee', 'fees')} due or disputed`,
        help: 'Collect it or settle the dispute, then mark it paid or waived.',
        href: '/admin/enquiries?status=completed_reported',
        cta: 'See completed enquiries',
      });
  }
  return items;
}
