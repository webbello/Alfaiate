import type { Variant } from './keys';

// SEC-04: the server never trusts the browser's resize. The browser's canvas re-encode is what actually strips metadata;
// this validator makes sure what arrives has the shape of such output, and nothing that can carry hidden data in a
// metadata container: only baseline/progressive JPEG with a JFIF header, an optional bounded colour profile, tables and scans
// whose declared sizes match their contents, and nothing after the end marker.
export const LIMITS = {
  thumb: { maxWidth: 320, maxBytes: 150 * 1024 },
  medium: { maxWidth: 800, maxBytes: 600 * 1024 },
  large: { maxWidth: 1600, maxBytes: 2 * 1024 * 1024 },
} as const;
const MAX_HEIGHT = 4000;
const MAX_SCANS = 12; // a progressive JPEG normally has about 10
const MAX_ICC_BYTES = 8192; // a colour profile (sRGB or Display P3) is a few KB; larger would be a payload
const MAX_ICC_SEGMENTS = 4;

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
const ascii = (bytes: Uint8Array, text: string) =>
  bytes.length >= text.length &&
  [...text].every((c, i) => bytes[i] === c.charCodeAt(0));

/** Quantisation tables: [Pq|Tq] then 64 or 128 bytes each; must add up exactly. */
function tablesDqtOk(p: Uint8Array): boolean {
  let pos = 0;
  while (pos < p.length) {
    const precision = p[pos] >> 4;
    if (precision > 1 || (p[pos] & 15) > 3) return false;
    pos += 1 + (precision ? 128 : 64);
  }
  return pos === p.length;
}

/** Huffman tables: [Tc|Th], 16 code counts, then that many symbols; must add up exactly. */
function tablesDhtOk(p: Uint8Array): boolean {
  let pos = 0;
  while (pos < p.length) {
    if (p[pos] >> 4 > 1 || (p[pos] & 15) > 3 || pos + 17 > p.length)
      return false;
    let symbols = 0;
    for (let i = 1; i <= 16; i++) symbols += p[pos + i];
    if (symbols > 256) return false;
    pos += 17 + symbols;
  }
  return pos === p.length;
}

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
  let components = 0;
  let sawFrame = false;
  let scans = 0;
  let iccSegments = 0;
  let first = true;
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
    const payload = bytes.subarray(i + 2, i + length);

    if (marker === 0xe0) {
      // The JFIF header, exactly as libjpeg writes it, and only as the very first segment.
      if (!first || length !== 16 || !ascii(payload, 'JFIF\0'))
        return fail('metadata');
    } else if (marker === 0xe2) {
      // A colour profile: signature, bounded size, before the picture.
      if (
        sawFrame ||
        length - 2 > MAX_ICC_BYTES ||
        !ascii(payload, 'ICC_PROFILE\0') ||
        ++iccSegments > MAX_ICC_SEGMENTS
      )
        return fail('metadata');
    } else if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) {
      return fail('metadata'); // EXIF/XMP (APP1), IPTC (APP13), every other APPn, comments
    } else if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (sawFrame || payload.length < 6) return fail('unsupported');
      components = payload[5];
      if (
        payload[0] !== 8 ||
        (components !== 1 && components !== 3) ||
        payload.length !== 6 + 3 * components
      )
        return fail('unsupported');
      sawFrame = true;
      height = (payload[1] << 8) | payload[2];
      width = (payload[3] << 8) | payload[4];
    } else if (marker === 0xdb) {
      if (!tablesDqtOk(payload)) return fail('unsupported');
    } else if (marker === 0xc4) {
      if (!tablesDhtOk(payload)) return fail('unsupported');
    } else if (marker === 0xdd) {
      if (length !== 4) return fail('unsupported');
    } else if (marker === 0xda) {
      const inScan = payload[0];
      if (
        !sawFrame ||
        !(inScan >= 1 && inScan <= components) ||
        payload.length !== 4 + 2 * inScan ||
        ++scans > MAX_SCANS
      )
        return fail('unsupported');
    } else {
      return fail('unsupported'); // lossless, arithmetic, hierarchical, reserved and unknown markers
    }
    first = false;
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

  if (!sawFrame || scans === 0) return fail('unsupported');
  if (width < 1 || height < 1 || width > limits.maxWidth || height > MAX_HEIGHT)
    return fail('dimensions');
  return { ok: true, width, height };
}
