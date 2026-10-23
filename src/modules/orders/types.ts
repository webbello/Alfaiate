import type { Lang } from '../../i18n/lang';

/**
 * Shop orders (docs/SPEC-shop.md, S6). The cart becomes an order through an `OrderService`. Today the only implementation prepares a WhatsApp message
 * (`whatsapp-service.ts`); when a payment gateway is added, a new implementation replaces it in `index.ts` and nothing else (the cart, the endpoint and the pages) changes.
 */
export type CartLine = { slug: string; quantity: number };

/** Where a part of the order goes. Decided by staff, never by the customer or a tailor (see routing.ts). */
export type OrderDestination = {
  kind: 'admin' | 'tailor' | 'number';
  /** E.164 number the WhatsApp message is addressed to. */
  number: string;
  /** Who the customer is writing to, for the page: "Alfaiate TL" or the seller's name. */
  label: string;
};

export type OrderLine = {
  slug: string;
  name: string;
  quantity: number;
  /** Price now, in cents; null when the seller asks for a quote. */
  priceCents: number | null;
  /** Absolute product page address, and the first public photo's address when there is one. */
  url: string;
  imageUrl: string | null;
  sellerName: string | null;
};

export type OrderGroup = {
  destination: OrderDestination;
  lines: OrderLine[];
  /** Sum of the priced lines (a line with no price adds nothing). */
  subtotalCents: number;
  /** The message text, and the wa.me address that opens WhatsApp with it. */
  message: string;
  whatsappUrl: string;
};

export type PlacedOrder = {
  reference: string;
  groups: OrderGroup[];
  /** Names of items that could not be ordered (no longer available, not on sale). */
  skipped: string[];
};

export type PlaceFailure = 'empty' | 'not_set_up' | 'invalid' | 'limited';
export type PlaceResult =
  { ok: true; order: PlacedOrder } | { ok: false; error: PlaceFailure };

export interface OrderService {
  place(input: {
    lines: CartLine[];
    lang: Lang;
    siteUrl: string;
    clientKey?: string;
  }): Promise<PlaceResult>;
}
