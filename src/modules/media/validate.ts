import type { Variant } from './keys';

// SEC-04: the server never trusts the browser's resize. It accepts only plain baseline/progressive JPEG with no metadata.
export const LIMITS = {
  thumb: { maxWidth: 320, maxBytes: 150 * 1024 },
  medium: { maxWidth: 800, maxBytes: 600 * 1024 },
  large: { maxWidth: 1600, maxBytes: 2 * 1024 * 1024 },
} as const;
const MAX_HEIGHT = 4000;

export type ValidationError =
  | 'too_large'
  | 'not_jpeg'
  | 'truncated'
  | 'metadata'
  | 'trailing_data'
  | 'unsupported'
  | 'dimensions';
export type Validation =
  | { ok: true; width: number; height: number }
  | { ok: false; error: ValidationError };

const fail = (error: ValidationError): Validation => ({ ok: false, error });

/** Walks the JPEG marker structure, including the entropy-coded data, so nothing can hide between segments. */
export function validateVariant(
  bytes: Uint8Array,
  variant: Variant,
): Validation {
  if (!Object.hasOwn(LIMITS, variant)) return fail('unsupported');
  const limits = LIMITS[variant];
  if (bytes.length > limits.maxBytes) return fail('too_large');
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  )
    return fail('not_jpeg');

  let width = 0;
  let height = 0;
  let sawFrame = false;
  let i = 2;
  for (;;) {
    if (i + 1 >= bytes.length) return fail('truncated');
    if (bytes[i] !== 0xff) return fail('not_jpeg');
    while (bytes[i + 1] === 0xff) i++; // fill bytes
    const marker = bytes[i + 1];
    i += 2;

    if (marker === 0xd9) {
      if (i !== bytes.length) return fail('trailing_data');
      break;
    }
    if (
      marker === 0x00 ||
      marker === 0x01 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
      return fail('not_jpeg');
    if (i + 2 > bytes.length) return fail('truncated');
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) return fail('truncated');

    if (marker === 0xe0 || marker === 0xe2) {
      // JFIF and colour profile: the only application segments allowed
    } else if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) {
      return fail('metadata'); // EXIF/XMP (APP1), IPTC (APP13), other APPn, comments
    } else if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (sawFrame || length < 8) return fail('unsupported');
      sawFrame = true;
      height = (bytes[i + 3] << 8) | bytes[i + 4];
      width = (bytes[i + 5] << 8) | bytes[i + 6];
    } else if (
      marker !== 0xc4 &&
      marker !== 0xdb &&
      marker !== 0xdd &&
      marker !== 0xda
    ) {
      return fail('unsupported'); // lossless, arithmetic, hierarchical, reserved and unknown markers
    }
    i += length;

    if (marker === 0xda) {
      // Skip entropy-coded data up to the next real marker (FF00 is a stuffed byte, FFD0-D7 are restarts).
      while (i + 1 < bytes.length) {
        if (bytes[i] === 0xff) {
          const next = bytes[i + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            i += 2;
            continue;
          }
          if (next !== 0xff) break;
        }
        i++;
      }
      if (i + 1 >= bytes.length) return fail('truncated');
    }
  }

  if (!sawFrame) return fail('unsupported');
  if (width < 1 || height < 1 || width > limits.maxWidth || height > MAX_HEIGHT)
    return fail('dimensions');
  return { ok: true, width, height };
}
