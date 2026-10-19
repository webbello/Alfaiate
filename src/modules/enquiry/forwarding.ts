import type { EnquiryDetail } from './status';

const CHANNEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  phone: 'phone calls',
  either: 'WhatsApp or phone calls',
};

/**
 * Plain text the owner copies and sends to a tailor by hand (BR-08). It holds only the fields the customer agreed to share:
 * name, number and channel, what they need, area, preferred time, notes. Never the source, status, spam flag or internal notes.
 * Empty for an anonymised enquiry.
 */
export function forwardingText(e: EnquiryDetail): string {
  if (!e.customer_name || !e.contact_number_e164) return '';
  const lines = [
    `Reference: ${e.reference_code}`,
    `Name: ${e.customer_name}`,
    `Number: ${e.contact_number_e164}${e.contact_channel ? ` (${CHANNEL[e.contact_channel] ?? e.contact_channel})` : ''}`,
    [
      'Needs',
      [e.category_name, e.service_description].filter(Boolean).join(' - '),
    ],
    ['Area', [e.area_name, e.area_text].filter(Boolean).join(' - ')],
    ['Preferred time', e.preferred_datetime_text],
    ['Notes', e.notes],
  ].flatMap((line) =>
    typeof line === 'string'
      ? [line]
      : line[1]
        ? [`${line[0]}: ${line[1]}`]
        : [],
  );
  return lines.join('\n');
}
