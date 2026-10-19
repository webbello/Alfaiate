import type { Dictionary } from '../../i18n/public';
import { fill } from '../../i18n/public';

/** Cents -> "$20", "$20.50", "$1,234.56" (US dollars, OQ-14). */
export function formatMoney(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  const whole = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${whole}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

/** Price wording for a range, a single price, a minimum or a maximum; null when the tailor gave no price. The caller always labels it approximate. */
export function priceText(
  t: Dictionary,
  from: number | null,
  to: number | null,
): string | null {
  if (from === null && to === null) return null;
  if (from !== null && to !== null)
    return from === to
      ? formatMoney(from)
      : `${formatMoney(from)} – ${formatMoney(to)}`;
  return fill(from !== null ? t.price.from : t.price.upTo, {
    amount: formatMoney((from ?? to) as number),
  });
}
