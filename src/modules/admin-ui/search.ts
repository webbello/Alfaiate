import { can } from '../auth/permissions';
import { fitLike, likeAnywhere } from '../db/like';

export const SEARCH_LIMIT = 10;

export type SearchResults = {
  /** `null` means the role may not search that source at all (shown as nothing, never as "no results"). */
  requests:
    | { id: number; reference: string; name: string | null; status: string }[]
    | null;
  tailors: { id: number; name: string; status: string }[] | null;
  orders: { reference: string; createdAt: string }[] | null;
};

const phoneDigits = (q: string) =>
  q.replace(/\D/g, '').replace(/^(00)?670/, '');

/**
 * One search over requests, tailors and shop orders (FR-ADM-14). Each source is queried only when the role holds the permission that opens its list:
 * enquiry.view for requests and orders, tailor.edit for tailors. Up to SEARCH_LIMIT of each, only fields the lists already show. Nothing is logged or stored.
 */
export async function adminSearch(
  db: D1Database,
  role: string,
  query: string,
): Promise<SearchResults> {
  const q = fitLike(query.slice(0, 100));
  const out: SearchResults = { requests: null, tailors: null, orders: null };
  const mayRequests = can(role, 'enquiry.view');
  const mayTailors = can(role, 'tailor.edit');
  if (mayRequests) out.requests = [];
  if (mayTailors) out.tailors = [];
  if (mayRequests) out.orders = [];
  if (!q) return out;
  const like = likeAnywhere(q);
  const digits = phoneDigits(q);
  const phoneLike = digits.length >= 3 ? likeAnywhere(digits) : null;

  if (mayRequests) {
    const { results } = await db
      .prepare(
        `SELECT id, reference_code AS reference, customer_name AS name, status FROM enquiry
         WHERE is_spam = 0 AND (reference_code LIKE ?1 ESCAPE '\\' OR customer_name LIKE ?1 ESCAPE '\\'${phoneLike ? " OR contact_number_e164 LIKE ?2 ESCAPE '\\'" : ''})
         ORDER BY created_at DESC, id DESC LIMIT ${SEARCH_LIMIT}`,
      )
      .bind(...(phoneLike ? [like, phoneLike] : [like]))
      .all<NonNullable<SearchResults['requests']>[number]>();
    out.requests = results;
    const orders = await db
      .prepare(
        `SELECT reference_code AS reference, created_at AS createdAt FROM shop_order
         WHERE reference_code LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT ${SEARCH_LIMIT}`,
      )
      .bind(like)
      .all<NonNullable<SearchResults['orders']>[number]>();
    out.orders = orders.results;
  }
  if (mayTailors) {
    const { results } = await db
      .prepare(
        `SELECT id, display_name AS name, status FROM tailor
         WHERE display_name LIKE ?1 ESCAPE '\\' OR slug LIKE ?1 ESCAPE '\\' OR private_contact_name LIKE ?1 ESCAPE '\\'${
           phoneLike
             ? " OR whatsapp_e164 LIKE ?2 ESCAPE '\\' OR phone_e164 LIKE ?2 ESCAPE '\\' OR private_phone LIKE ?2 ESCAPE '\\'"
             : ''
         }
         ORDER BY display_name LIMIT ${SEARCH_LIMIT}`,
      )
      .bind(...(phoneLike ? [like, phoneLike] : [like]))
      .all<NonNullable<SearchResults['tailors']>[number]>();
    out.tailors = results;
  }
  return out;
}
