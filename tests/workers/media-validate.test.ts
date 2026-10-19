import { describe, expect, it } from 'vitest';
import { LIMITS, validateVariant } from '../../src/modules/media/validate';
import {
  COMMENT,
  EXIF,
  GIF,
  HTML,
  ICC,
  IPTC,
  PNG,
  SVG,
  WEBP,
  XMP,
  jpeg,
  pad,
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
