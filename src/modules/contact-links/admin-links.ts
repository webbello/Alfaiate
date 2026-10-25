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

export function tailorWhatsapp(
  number: string | null,
  reference: string,
): string | null {
  if (!number || !E164.test(number)) return null;
  return whatsappLink(
    number,
    `Hello, Alfaiate TL has a customer request for you: ${reference}. Can you take it?`,
  );
}
