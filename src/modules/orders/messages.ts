import type { OrderLine } from './types';

const usd = (cents: number) => `$ ${(cents / 100).toFixed(2)} USD`;
const clean = (text: string) =>
  Array.from(text, (c) =>
    c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c,
  )
    .join('')
    .replace(/[*_~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The order message the customer sends on WhatsApp: clear, in the shop's English (the staff language), with each item's name, quantity, price, product link
 * and photo link, the total, the order reference, and blank lines for the customer to add their name and where to deliver. WhatsApp shows *bold* and _italic_.
 * Names are cleaned of formatting characters so a product name cannot change how the message looks. Nothing about the customer is included.
 */
export function orderMessage(input: {
  reference: string;
  siteName: string;
  lines: OrderLine[];
  subtotalCents: number;
  /** Shown to staff when an order is routed through the admin for a tailor's items. */
  viaAdmin: boolean;
}): string {
  const out: string[] = [];
  out.push(`🧵 *New order – ${clean(input.siteName)}*`);
  out.push(`Order ${input.reference}`);
  out.push('');
  input.lines.forEach((line, index) => {
    out.push(`*${index + 1}. ${clean(line.name)}* × ${line.quantity}`);
    if (line.priceCents !== null) {
      out.push(
        `   ${usd(line.priceCents)} each = ${usd(line.priceCents * line.quantity)}`,
      );
    } else {
      out.push('   Price: to be confirmed');
    }
    if (line.sellerName)
      out.push(
        `   Seller: ${clean(line.sellerName)}${input.viaAdmin ? ' (through the admin)' : ''}`,
      );
    out.push(`   🔗 ${line.url}`);
    if (line.imageUrl) out.push(`   🖼 ${line.imageUrl}`);
    out.push('');
  });
  out.push(`*Total: ${usd(input.subtotalCents)}*`);
  if (input.lines.some((l) => l.priceCents === null))
    out.push('_(items with no price are not in the total)_');
  out.push('');
  out.push('Name:');
  out.push('Delivery or pick-up place:');
  out.push('Notes:');
  out.push('');
  out.push(
    '_Prices, delivery and returns are agreed with the seller. No payment has been taken on the site._',
  );
  return out.join('\n');
}
