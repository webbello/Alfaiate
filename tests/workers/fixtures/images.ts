// Tiny synthetic JPEGs built byte by byte for validator tests. They are not decodable pictures, only well-formed
// marker structures, which is all the server-side checks read. No real photos or people are involved.
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  ...u16(payload.length + 2),
  ...payload,
];

export const JFIF = segment(
  0xe0,
  [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0],
);
export const ICC = segment(0xe2, [
  ...Array.from('ICC_PROFILE\0', (c) => c.charCodeAt(0)),
  1,
  1,
  0,
  0,
  0,
  0,
]);
export const EXIF = segment(0xe1, [
  ...Array.from('Exif\0\0', (c) => c.charCodeAt(0)),
  0x4d,
  0x4d,
  0,
  42,
  0,
  0,
  0,
  8,
  0,
  0,
]);
export const XMP = segment(
  0xe1,
  Array.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>', (c) =>
    c.charCodeAt(0),
  ),
);
export const IPTC = segment(
  0xed,
  Array.from('Photoshop 3.0\0', (c) => c.charCodeAt(0)),
);
export const COMMENT = segment(
  0xfe,
  Array.from('taken at the beach', (c) => c.charCodeAt(0)),
);

export function jpeg(opts: {
  width: number;
  height: number;
  before?: number[][];
  after?: number[][];
  sof?: number;
  entropy?: number[];
  noEoi?: boolean;
  trailing?: number[];
}): Uint8Array {
  const sof = segment(opts.sof ?? 0xc0, [
    8,
    ...u16(opts.height),
    ...u16(opts.width),
    1,
    1,
    0x11,
    0,
  ]);
  const sos = segment(0xda, [1, 1, 0, 0, 63, 0]);
  const entropy = opts.entropy ?? [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]; // includes a stuffed FF00 and a restart marker
  return new Uint8Array([
    0xff,
    0xd8,
    ...JFIF,
    ...(opts.before ?? []).flat(),
    ...sof,
    ...sos,
    ...entropy,
    ...(opts.after ?? []).flat(),
    ...(opts.noEoi ? [] : [0xff, 0xd9]),
    ...(opts.trailing ?? []),
  ]);
}

export const pad = (bytes: Uint8Array, size: number): Uint8Array => {
  // Grows entropy-coded data so a file reaches a given size while staying structurally valid.
  const extra = Math.max(size - bytes.length, 0);
  const body = bytes.slice(0, bytes.length - 2);
  return new Uint8Array([...body, ...new Array(extra).fill(0x55), 0xff, 0xd9]);
};

export const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
]);
export const GIF = new Uint8Array(
  Array.from('GIF89a\x01\x00\x01\x00', (c) => c.charCodeAt(0)),
);
export const HTML = new TextEncoder().encode(
  '<html><script>alert(1)</script></html>',
);
export const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
export const WEBP = new Uint8Array([
  ...Array.from('RIFF\x1a\x00\x00\x00WEBPVP8 ', (c) => c.charCodeAt(0)),
  0,
  0,
  0,
  0,
]);
