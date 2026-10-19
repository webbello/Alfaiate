// Pure sizing rules shared by the browser upload script and its tests. They mirror the server limits in
// src/modules/media/validate.ts; the server re-checks everything, this only keeps honest uploads inside them.
export const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024; // AD-07
export const MAX_HEIGHT = 4000;
export const VARIANT_WIDTHS = { thumb: 320, medium: 800, large: 1600 } as const;
export type VariantName = keyof typeof VARIANT_WIDTHS;

export function planVariants(
  width: number,
  height: number,
): Record<VariantName, { width: number; height: number }> {
  if (!(width > 0) || !(height > 0)) throw new Error('The picture has no size');
  const plan = {} as Record<VariantName, { width: number; height: number }>;
  for (const name of Object.keys(VARIANT_WIDTHS) as VariantName[]) {
    const scale = Math.min(
      1,
      VARIANT_WIDTHS[name] / width,
      MAX_HEIGHT / height,
    );
    plan[name] = {
      width: Math.max(1, Math.floor(width * scale)),
      height: Math.max(1, Math.floor(height * scale)),
    };
  }
  return plan;
}

export function checkOriginal(file: {
  type: string;
  size: number;
}): 'type' | 'empty' | 'size' | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return 'type';
  if (file.size === 0) return 'empty';
  if (file.size > MAX_ORIGINAL_BYTES) return 'size';
  return null;
}
