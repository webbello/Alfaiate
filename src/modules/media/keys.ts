export const VARIANTS = ['thumb', 'medium', 'large'] as const;
export type Variant = (typeof VARIANTS)[number];

const KEY = /^tailor\/(\d{1,9})\/([0-9a-f]{32})\/(thumb|medium|large)\.jpg$/;

/** 128 random bits as hex. Unguessable, so a leaked listing cannot be walked; the database is the only index. */
export function newImageKey(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Every object of one tailor shares this prefix (trailing slash, so tailor 1 never matches tailor 10). */
export const imagePrefix = (tailorId: number) => `tailor/${tailorId}/`;

export const variantKey = (
  tailorId: number,
  imageKey: string,
  variant: Variant,
) => `${imagePrefix(tailorId)}${imageKey}/${variant}.jpg`;

/** Strict parse of an object key; anything else (traversal, encoding, case, extras) is null. */
export function parseVariantKey(
  key: string,
): { tailorId: number; imageKey: string; variant: Variant } | null {
  const match = KEY.exec(key);
  return match
    ? {
        tailorId: Number(match[1]),
        imageKey: match[2],
        variant: match[3] as Variant,
      }
    : null;
}

const PRODUCT_KEY =
  /^product\/(\d{1,9})\/([0-9a-f]{32})\/(thumb|medium|large)\.jpg$/;
export const productImagePrefix = (productId: number) =>
  `product/${productId}/`;
export const productVariantKey = (
  productId: number,
  imageKey: string,
  variant: Variant,
) => `${productImagePrefix(productId)}${imageKey}/${variant}.jpg`;

/** Strict parse of a product photo key; anything else is null. */
export function parseProductKey(
  key: string,
): { productId: number; imageKey: string; variant: Variant } | null {
  const match = PRODUCT_KEY.exec(key);
  return match
    ? {
        productId: Number(match[1]),
        imageKey: match[2],
        variant: match[3] as Variant,
      }
    : null;
}
