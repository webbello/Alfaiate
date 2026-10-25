import { E164, telLink } from './tel';
import { whatsappLink } from './whatsapp';

/**
 * The staff buttons that reach a customer or a tailor (FR-ADM-13). The prefilled message names the reference code and nothing else: no name, address or notes
 * (the details a customer agreed to share are copied separately, BR-08). A customer who asked for phone calls gets a call link, not WhatsApp.
 */
export type Reach = { kind: 'whatsapp' | 'call'; href: string };

export function customerReach(e: {
  reference_code: string;
  contact_number_e164: string | null;
  contact_channel: string | null;
}): Reach | null {
  const number = e.contact_number_e164;
  if (!number || !E164.test(number)) return null;
  if (e.contact_channel === 'phone')
    return { kind: 'call', href: telLink(number) };
  return {
    kind: 'whatsapp',
    href: whatsappLink(
      number,
      `Hello, this is Alfaiate TL about your tailor request ${e.reference_code}.`,
    ),
  };
}

/** What a tailor sees after accepting (FR-TPO-12): WhatsApp, or a call link when the customer asked for phone calls. The opening line holds the reference code only. */
export function customerContactForTailor(c: {
  reference: string;
  number: string | null;
  channel: string | null;
}): Reach | null {
  if (!c.number || !E164.test(c.number)) return null;
  if (c.channel === 'phone') return { kind: 'call', href: telLink(c.number) };
  return {
    kind: 'whatsapp',
    href: whatsappLink(
      c.number,
      `Hello, I am the tailor Alfaiate TL asked to contact you about your request ${c.reference}.`,
    ),
  };
}

export function tailorWhatsapp(
  number: string | null,
  reference: string,
  /** Set when the referral is in the tailor's portal inbox: the message then points at the portal sign-in (a link, no customer data). */
  portalUrl?: string,
): string | null {
  if (!number || !E164.test(number)) return null;
  return whatsappLink(
    number,
    portalUrl
      ? `Hello, Alfaiate TL has a new request for you in your portal: ${reference}. Sign in: ${portalUrl}`
      : `Hello, Alfaiate TL has a customer request for you: ${reference}. Can you take it?`,
  );
}
