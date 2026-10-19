import type { Dictionary } from '../../i18n/public';
import { fill } from '../../i18n/public';
import { E164 } from './tel';

/** `https://wa.me/<digits>?text=<encoded>`. WhatsApp links only; no API (ARCHITECTURE §7). */
export function whatsappLink(e164: string, text: string): string {
  if (!E164.test(e164)) throw new Error('Not an E.164 number');
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}`;
}

/** The prefilled message names the listing and nothing else; never customer data (FR-PRO-04). */
export function whatsappMessage(t: Dictionary, listingName: string): string {
  const printable = Array.from(listingName, (c) =>
    c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c,
  ).join('');
  const name = printable.replace(/\s+/g, ' ').trim().slice(0, 120);
  return fill(t.contact.whatsappMessage, { name });
}
