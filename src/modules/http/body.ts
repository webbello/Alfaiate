/** Largest body accepted by an ordinary admin form: a few short fields. */
export const SMALL_FORM_LIMIT = 64 * 1024;
/** Largest body accepted by the photo upload: the three size caps in media/validate.ts plus a margin for the text fields. */
export const UPLOAD_LIMIT = 3 * 1024 * 1024 + 64 * 1024;

/**
 * Reads a form body but stops once it exceeds `maxBytes`, instead of buffering whatever a signed-in user sends
 * (Workers have 128 MB of memory). Works with or without a Content-Length header. A malformed body gives an empty form.
 */
export async function readForm(
  request: Request,
  maxBytes = SMALL_FORM_LIMIT,
): Promise<{ form: FormData; tooLarge: boolean }> {
  const tooLarge = { form: new FormData(), tooLarge: true };
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge;
  if (!request.body) return { form: new FormData(), tooLarge: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return tooLarge;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const form = await new Response(bytes, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData();
    return { form, tooLarge: false };
  } catch {
    return { form: new FormData(), tooLarge: false };
  }
}

/** A route id: plain digits only (Number() would also accept 1e3 or 0x10). NaN when invalid, so `Number.isInteger` checks keep working. */
export function parseId(value: string | undefined): number {
  return value !== undefined && /^\d{1,9}$/.test(value)
    ? Number(value)
    : Number.NaN;
}
