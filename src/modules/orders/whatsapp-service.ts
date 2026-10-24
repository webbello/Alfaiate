import { hit } from '../auth/rate-limit';
import { whatsappLink } from '../contact-links/whatsapp';
import { REFERENCE_ALPHABET } from '../enquiry/reference';
import { orderMessage } from './messages';
import { resolveDestination, type SellerRouting } from './routing';
import type {
  CartLine,
  OrderGroup,
  OrderLine,
  OrderService,
  PlaceResult,
} from './types';

export const MAX_ORDER_LINES = 10;
export const ORDERS_PER_HOUR = 30;

/** `OR-` plus 8 random characters from the same alphabet as request references: random, non-sequential, nothing personal. */
export function newOrderReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `OR-${[...bytes].map((b) => REFERENCE_ALPHABET[b & 31]).join('')}`;
}

type Row = {
  id: number;
  slug: string;
  name: string;
  price_cents: number | null;
  availability: 'available' | 'unavailable';
  seller_tailor_id: number | null;
  seller_name: string | null;
  order_route: 'admin' | 'tailor' | 'number' | null;
  order_number_e164: string | null;
  whatsapp_e164: string | null;
  contact_publish_consent: number | null;
  photo_key: string | null;
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The WhatsApp order service: prices, names and sellers are read from the database (what the browser sent is only slugs and quantities), items are grouped by the
 * destination staff chose, one message is prepared for each group and the order is recorded without any customer detail. Replace this class (see index.ts) to take payment.
 */
export function whatsappOrderService(deps: {
  db: D1Database;
  adminNumber: string | null;
  siteName: string;
}): OrderService {
  return {
    async place({ lines, siteUrl, clientKey }): Promise<PlaceResult> {
      const { db, adminNumber, siteName } = deps;
      if (!adminNumber) return { ok: false, error: 'not_set_up' };
      const wanted = new Map<string, number>();
      for (const line of lines) {
        if (
          !SLUG.test(line.slug) ||
          !Number.isInteger(line.quantity) ||
          line.quantity < 1 ||
          line.quantity > 99
        )
          return { ok: false, error: 'invalid' };
        wanted.set(
          line.slug,
          Math.min(99, (wanted.get(line.slug) ?? 0) + line.quantity),
        );
      }
      if (wanted.size === 0) return { ok: false, error: 'empty' };
      if (wanted.size > MAX_ORDER_LINES) return { ok: false, error: 'invalid' };
      if (
        clientKey &&
        (await hit(db, `order:${clientKey}`, 3600)) > ORDERS_PER_HOUR
      )
        return { ok: false, error: 'limited' };

      // Published products only, and a tailor's product only while that tailor is published with recorded permission (BR-05, BR-06, BR-14).
      const { results } = await db
        .prepare(
          `SELECT p.id, p.slug, p.name, p.price_cents, p.availability, p.seller_tailor_id,
                  st.display_name AS seller_name, o.route AS order_route, o.number_e164 AS order_number_e164, st.whatsapp_e164, st.contact_publish_consent,
                  (SELECT i.file_key FROM product_image i WHERE i.product_id = p.id AND i.permission_granted = 1 ORDER BY i.sort_order, i.id LIMIT 1) AS photo_key
           FROM product p LEFT JOIN tailor st ON st.id = p.seller_tailor_id
           LEFT JOIN tailor_order_routing o ON o.tailor_id = st.id
           WHERE p.is_published = 1 AND (p.seller_tailor_id IS NULL OR (st.is_published = 1 AND st.permission_recorded = 1))
             AND p.slug IN (SELECT value FROM json_each(?))`,
        )
        .bind(JSON.stringify([...wanted.keys()]))
        .all<Row>();
      const bySlug = new Map(results.map((r) => [r.slug, r]));
      const skipped: string[] = [];
      const reference = newOrderReference();
      const groups = new Map<
        string,
        {
          destination: ReturnType<typeof resolveDestination>;
          lines: OrderLine[];
          viaAdmin: boolean;
        }
      >();
      for (const [slug, quantity] of wanted) {
        const row = bySlug.get(slug);
        if (!row || row.availability !== 'available') {
          skipped.push(row?.name ?? slug);
          continue;
        }
        const seller: SellerRouting = {
          tailorId: row.seller_tailor_id,
          name: row.seller_name,
          orderRoute: row.order_route ?? 'admin',
          orderNumber: row.order_number_e164,
          whatsapp: row.whatsapp_e164,
          contactConsent: row.contact_publish_consent === 1,
        };
        const destination = resolveDestination(seller, adminNumber, siteName);
        const line: OrderLine = {
          slug,
          name: row.name,
          quantity,
          priceCents: row.price_cents,
          url: `${siteUrl}/shop/${slug}`,
          imageUrl: row.photo_key
            ? `${siteUrl}/media/shop/product/${row.id}/${row.photo_key}/medium.jpg`
            : null,
          sellerName: row.seller_name,
        };
        const group = groups.get(destination.number) ?? {
          destination,
          lines: [],
          viaAdmin: destination.kind === 'admin',
        };
        group.lines.push(line);
        groups.set(destination.number, group);
      }
      if (groups.size === 0) return { ok: false, error: 'empty' };

      const built: OrderGroup[] = [...groups.values()].map((g) => {
        const subtotalCents = g.lines.reduce(
          (sum, l) => sum + (l.priceCents ?? 0) * l.quantity,
          0,
        );
        const message = orderMessage({
          reference,
          siteName,
          lines: g.lines,
          subtotalCents,
          viaAdmin: g.viaAdmin,
        });
        return {
          destination: g.destination,
          lines: g.lines,
          subtotalCents,
          message,
          whatsappUrl: whatsappLink(g.destination.number, message),
        };
      });
      const total = built.reduce((sum, g) => sum + g.subtotalCents, 0);
      await db
        .prepare(
          'INSERT INTO shop_order (reference_code, total_cents, items_json, routes_json) VALUES (?, ?, ?, ?)',
        )
        .bind(
          reference,
          total,
          JSON.stringify(
            built.flatMap((g) =>
              g.lines.map((l) => ({
                slug: l.slug,
                name: l.name,
                quantity: l.quantity,
                priceCents: l.priceCents,
              })),
            ),
          ),
          JSON.stringify(
            built.map((g) => ({
              kind: g.destination.kind,
              label: g.destination.label,
              items: g.lines.length,
              subtotalCents: g.subtotalCents,
            })),
          ),
        )
        .run();
      return { ok: true, order: { reference, groups: built, skipped } };
    },
  };
}

export type { CartLine };
