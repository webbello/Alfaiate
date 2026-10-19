import { describe, expect, it } from 'vitest';
import { LIMITS, validateVariant } from '../../src/modules/media/validate';
import {
  COMMENT,
  EXIF,
  GIF,
  HTML,
  ICC,
  IPTC,
  JFIF,
  PNG,
  SVG,
  WEBP,
  XMP,
  dht,
  dqt,
  dri,
  jpeg,
  junk,
  pad,
  segment,
} from './fixtures/images';

describe('validateVariant: accepted', () => {
  it('accepts a plain JPEG within the variant width and reports its size', () => {
    expect(validateVariant(jpeg({ width: 300, height: 200 }), 'thumb')).toEqual(
      { ok: true, width: 300, height: 200 },
    );
  });
  it('accepts exactly the maximum width for each variant', () => {
    expect(validateVariant(jpeg({ width: 320, height: 240 }), 'thumb').ok).toBe(
      true,
    );
    expect(
      validateVariant(jpeg({ width: 800, height: 600 }), 'medium').ok,
    ).toBe(true);
    expect(
      validateVariant(jpeg({ width: 1600, height: 1200 }), 'large').ok,
    ).toBe(true);
  });
  it('accepts progressive JPEG and an embedded colour profile, which browsers add', () => {
    expect(
      validateVariant(jpeg({ width: 300, height: 200, sof: 0xc2 }), 'thumb').ok,
    ).toBe(true);
    expect(
      validateVariant(jpeg({ width: 300, height: 200, before: [ICC] }), 'thumb')
        .ok,
    ).toBe(true);
  });
  it('is not confused by stuffed FF00 bytes and restart markers inside the image data', () => {
    expect(
      validateVariant(
        jpeg({
          width: 300,
          height: 200,
          entropy: [0xff, 0x00, 0xff, 0xd3, 0xff, 0x00, 0x01],
        }),
        'thumb',
      ).ok,
    ).toBe(true);
  });
});

describe('validateVariant: metadata (EXIF, XMP, IPTC, comments)', () => {
  const cases: [string, number[]][] = [
    ['EXIF', EXIF],
    ['XMP', XMP],
    ['IPTC', IPTC],
    ['a comment', COMMENT],
  ];
  for (const [name, segment] of cases) {
    it(`rejects ${name} before the image data`, () => {
      expect(
        validateVariant(
          jpeg({ width: 300, height: 200, before: [segment] }),
          'thumb',
        ),
      ).toEqual({ ok: false, error: 'metadata' });
    });
    it(`rejects ${name} hidden after the image data`, () => {
      expect(
        validateVariant(
          jpeg({ width: 300, height: 200, after: [segment] }),
          'thumb',
        ),
      ).toEqual({ ok: false, error: 'metadata' });
    });
  }
});

describe('validateVariant: wrong or hostile files', () => {
  it('rejects other formats even when they could be named .jpg', () => {
    for (const bytes of [
      PNG,
      GIF,
      HTML,
      SVG,
      WEBP,
      new Uint8Array(),
      new Uint8Array([0xff, 0xd8]),
    ]) {
      const result = validateVariant(bytes, 'thumb');
      expect(result.ok).toBe(false);
    }
    expect(validateVariant(PNG, 'thumb')).toEqual({
      ok: false,
      error: 'not_jpeg',
    });
  });
  it('rejects a truncated file and one with no end marker', () => {
    const full = jpeg({ width: 300, height: 200 });
    expect(validateVariant(full.slice(0, full.length - 10), 'thumb').ok).toBe(
      false,
    );
    expect(
      validateVariant(jpeg({ width: 300, height: 200, noEoi: true }), 'thumb'),
    ).toEqual({ ok: false, error: 'truncated' });
  });
  it('rejects bytes hidden after the end marker (polyglots)', () => {
    expect(
      validateVariant(
        jpeg({
          width: 300,
          height: 200,
          trailing: Array.from('<script>alert(1)</script>', (c) =>
            c.charCodeAt(0),
          ),
        }),
        'thumb',
      ),
    ).toEqual({ ok: false, error: 'trailing_data' });
  });
  it('rejects JPEG kinds it does not handle', () => {
    expect(
      validateVariant(jpeg({ width: 300, height: 200, sof: 0xc3 }), 'thumb'),
    ).toEqual({ ok: false, error: 'unsupported' });
  });
});

describe('validateVariant: dimensions and size', () => {
  it('rejects a width above the variant maximum', () => {
    expect(validateVariant(jpeg({ width: 321, height: 200 }), 'thumb')).toEqual(
      { ok: false, error: 'dimensions' },
    );
    expect(
      validateVariant(jpeg({ width: 1601, height: 200 }), 'large'),
    ).toEqual({ ok: false, error: 'dimensions' });
  });
  it('rejects zero dimensions and absurd heights', () => {
    expect(validateVariant(jpeg({ width: 0, height: 200 }), 'thumb')).toEqual({
      ok: false,
      error: 'dimensions',
    });
    expect(validateVariant(jpeg({ width: 300, height: 0 }), 'thumb')).toEqual({
      ok: false,
      error: 'dimensions',
    });
    expect(
      validateVariant(jpeg({ width: 300, height: 65535 }), 'thumb'),
    ).toEqual({ ok: false, error: 'dimensions' });
  });
  it('rejects a file over the size cap for its variant and accepts one right at the cap', () => {
    const base = jpeg({ width: 300, height: 200 });
    expect(validateVariant(pad(base, LIMITS.thumb.maxBytes), 'thumb').ok).toBe(
      true,
    );
    expect(
      validateVariant(pad(base, LIMITS.thumb.maxBytes + 1), 'thumb'),
    ).toEqual({ ok: false, error: 'too_large' });
  });
  it('knows exactly three variants', () => {
    expect(Object.keys(LIMITS).sort()).toEqual(['large', 'medium', 'thumb']);
    expect(
      validateVariant(jpeg({ width: 100, height: 100 }), 'huge' as never),
    ).toEqual({ ok: false, error: 'unsupported' });
  });
});

describe('validateVariant: segment contents, not just markers (SEC-04)', () => {
  const rejects = (bytes: Uint8Array, error = 'metadata') =>
    expect(validateVariant(bytes, 'thumb')).toEqual({ ok: false, error });
  const text = (value: string) => Array.from(value, (c) => c.charCodeAt(0));
  const icc = (size: number) =>
    segment(0xe2, [...text('ICC_PROFILE\0'), 1, 1, ...new Array(size).fill(7)]);

  it('accepts the segments a browser really writes: JFIF, quantisation and Huffman tables, a restart interval, a colour profile', () => {
    expect(
      validateVariant(
        jpeg({ width: 300, height: 200, before: [dqt(2), dht(), dri(2), ICC] }),
        'thumb',
      ).ok,
    ).toBe(true);
  });

  it('rejects a large payload hidden in an application segment', () => {
    rejects(jpeg({ width: 300, height: 200, before: [junk(0xe0, 60000)] }));
    rejects(jpeg({ width: 300, height: 200, before: [junk(0xe2, 60000)] }));
    rejects(jpeg({ width: 300, height: 200, before: [junk(0xe3, 100)] }));
  });

  it('allows only one JFIF header, of the exact standard form', () => {
    rejects(jpeg({ width: 300, height: 200, before: [JFIF] })); // a second one
    rejects(
      jpeg({
        width: 300,
        height: 200,
        jfif: segment(0xe0, [
          ...text('JFIF\0'),
          ...new Array(60000).fill(0x41),
        ]),
      }),
    ); // right signature, hidden payload, as the first segment
    rejects(
      jpeg({
        width: 300,
        height: 200,
        before: [segment(0xe0, text('NOTJFIF\0xxxxxxxx'))],
      }),
    );
  });

  it('allows a colour profile only with the ICC signature, of bounded size, before the picture', () => {
    expect(
      validateVariant(
        jpeg({ width: 300, height: 200, before: [icc(2000)] }),
        'thumb',
      ).ok,
    ).toBe(true);
    rejects(jpeg({ width: 300, height: 200, before: [icc(9000)] }));
    rejects(
      jpeg({
        width: 300,
        height: 200,
        before: [segment(0xe2, text('FPXR\0 hidden bytes here'))],
      }),
    );
  });

  it('rejects application segments placed after the start of the picture data', () => {
    rejects(jpeg({ width: 300, height: 200, after: [ICC] }));
    rejects(jpeg({ width: 300, height: 200, after: [JFIF] }));
  });

  it('checks that table segments are exactly as long as their contents say', () => {
    rejects(
      jpeg({
        width: 300,
        height: 200,
        before: [
          segment(0xdb, [
            0,
            ...new Array(64).fill(16),
            ...new Array(500).fill(0x41),
          ]),
        ],
      }),
      'unsupported',
    );
    rejects(
      jpeg({
        width: 300,
        height: 200,
        before: [
          segment(0xc4, [
            0x00,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0x05,
            ...new Array(300).fill(0x41),
          ]),
        ],
      }),
      'unsupported',
    );
    rejects(
      jpeg({ width: 300, height: 200, before: [dri(60)] }),
      'unsupported',
    );
  });

  it('checks frame and scan headers for exact size and sane values', () => {
    rejects(
      jpeg({
        width: 300,
        height: 200,
        sofPayload: [
          8,
          0,
          200,
          1,
          44,
          1,
          1,
          0x11,
          0,
          ...new Array(500).fill(0x41),
        ],
      }),
      'unsupported',
    );
    rejects(
      jpeg({
        width: 300,
        height: 200,
        sofPayload: [12, 0, 200, 1, 44, 1, 1, 0x11, 0],
      }),
      'unsupported',
    );
    rejects(
      jpeg({
        width: 300,
        height: 200,
        sofPayload: [8, 0, 200, 1, 44, 5, 1, 0x11, 0],
      }),
      'unsupported',
    );
    rejects(
      jpeg({
        width: 300,
        height: 200,
        sosPayload: [1, 1, 0, 0, 63, 0, ...new Array(500).fill(0x41)],
      }),
      'unsupported',
    );
  });

  it('needs a picture scan and refuses an absurd number of scans', () => {
    rejects(jpeg({ width: 300, height: 200, noScan: true }), 'unsupported');
    expect(
      validateVariant(
        jpeg({ width: 300, height: 200, sof: 0xc2, scans: 10 }),
        'thumb',
      ).ok,
    ).toBe(true);
    rejects(
      jpeg({ width: 300, height: 200, sof: 0xc2, scans: 13 }),
      'unsupported',
    );
  });
});
