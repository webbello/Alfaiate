import { internationalNumber } from '../config';
import type { OrderDestination } from './types';

/** What the order router knows about a product's seller. All of it is set by staff (or is the tailor's own public contact), never by the customer or the tailor's own forms. */
export type SellerRouting = {
  /** null for the platform's own product. */
  tailorId: number | null;
  name: string | null;
  orderRoute: 'admin' | 'tailor' | 'number';
  orderNumber: string | null;
  /** The tailor's own WhatsApp, usable only when they agreed to show it (contact_publish_consent). */
  whatsapp: string | null;
  contactConsent: boolean;
};

/**
 * Where one product's order goes (S6): the platform's own products always go to the admin. A tailor's product goes to the admin first unless staff set the tailor's route
 * to their own number or to another number staff entered. If the chosen number is missing or invalid, the admin gets it, so an order is never lost and never goes anywhere
 * staff did not choose.
 */
export function resolveDestination(
  seller: SellerRouting,
  adminNumber: string,
  adminLabel: string,
): OrderDestination {
  const admin: OrderDestination = {
    kind: 'admin',
    number: adminNumber,
    label: adminLabel,
  };
  if (seller.tailorId === null) return admin;
  if (seller.orderRoute === 'tailor') {
    const number = seller.contactConsent
      ? internationalNumber(seller.whatsapp)
      : null;
    if (number)
      return { kind: 'tailor', number, label: seller.name ?? adminLabel };
  }
  if (seller.orderRoute === 'number') {
    const number = internationalNumber(seller.orderNumber);
    if (number)
      return { kind: 'number', number, label: seller.name ?? adminLabel };
  }
  return admin;
}
