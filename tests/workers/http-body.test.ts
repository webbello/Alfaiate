import { describe, expect, it } from 'vitest';
import {
  SMALL_FORM_LIMIT,
  UPLOAD_LIMIT,
  parseId,
  readForm,
} from '../../src/modules/http/body';

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request('https://example.test/x', { method: 'POST', body, headers });
const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

describe('readForm', () => {
  it('reads url-encoded and multipart forms', async () => {
    const a = await readForm(post(new URLSearchParams({ a: '1', b: 'two' })));
    expect(a.tooLarge).toBe(false);
    expect(a.form.get('b')).toBe('two');
    const data = new FormData();
    data.set('name', 'x');
    data.set('file', new File([new Uint8Array([1, 2, 3])], 'f.bin'));
    const b = await readForm(post(data), 1024 * 1024);
    expect(b.form.get('name')).toBe('x');
    expect((b.form.get('file') as File).size).toBe(3);
  });

  it('refuses a body larger than the limit without reading it, when the size is declared', async () => {
    const result = await readForm(
      post('x', { 'content-length': String(SMALL_FORM_LIMIT + 1) }),
    );
    expect(result.tooLarge).toBe(true);
    expect([...result.form.keys()]).toEqual([]);
  });

  it('refuses a body larger than the limit even when the size is not declared (streamed)', async () => {
    const chunk = new Uint8Array(16 * 1024).fill(65);
    const request = new Request('https://example.test/x', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: streamOf(Array.from({ length: 10 }, () => chunk)),
      // @ts-expect-error duplex is required for stream bodies and missing from the DOM typings
      duplex: 'half',
    });
    expect((await readForm(request)).tooLarge).toBe(true);
  });

  it('accepts a body of exactly the limit', async () => {
    const value = 'a'.repeat(SMALL_FORM_LIMIT - 2); // "x=" + value is exactly the limit
    const result = await readForm(
      post(`x=${value}`, {
        'content-type': 'application/x-www-form-urlencoded',
      }),
    );
    expect(result.tooLarge).toBe(false);
    expect(String(result.form.get('x')).length).toBe(value.length);
  });

  it('returns an empty form, not an error, for a malformed or empty body', async () => {
    const bad = await readForm(
      post('--nope', { 'content-type': 'multipart/form-data; boundary=zzz' }),
    );
    expect(bad.tooLarge).toBe(false);
    expect([...bad.form.keys()]).toEqual([]);
    expect([
      ...(
        await readForm(
          new Request('https://example.test/x', { method: 'POST' }),
        )
      ).form.keys(),
    ]).toEqual([]);
  });

  it('has an upload limit big enough for three variants plus text', () => {
    expect(UPLOAD_LIMIT).toBeGreaterThan(
      150 * 1024 + 600 * 1024 + 2 * 1024 * 1024,
    );
    expect(UPLOAD_LIMIT).toBeLessThan(4 * 1024 * 1024);
  });
});

describe('parseId', () => {
  it('accepts plain digits only', () => {
    expect(parseId('7')).toBe(7);
    expect(parseId('0012')).toBe(12);
    for (const bad of [
      '1e3',
      '0x10',
      '-1',
      '1.5',
      ' 7',
      '7 ',
      '',
      'abc',
      '1234567890',
      undefined,
    ])
      expect(Number.isInteger(parseId(bad as never)), String(bad)).toBe(false);
  });
});
