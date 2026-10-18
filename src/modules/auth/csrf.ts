// The CSRF token is derived from the (HttpOnly) session token, so it needs no storage and no extra secret.
const encoder = new TextEncoder();

async function sha256(text: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(text)),
  );
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

export async function csrfTokenFor(sessionToken: string): Promise<string> {
  return toBase64Url(await sha256(`csrf:${sessionToken}`));
}

export async function verifyCsrf(
  sessionToken: string,
  submitted: string | null | undefined,
): Promise<boolean> {
  if (!submitted) return false;
  const expected = encoder.encode(await csrfTokenFor(sessionToken));
  const actual = encoder.encode(submitted);
  if (expected.length !== actual.length) return false;
  let difference = 0; // constant-time comparison
  for (let i = 0; i < expected.length; i++)
    difference |= expected[i] ^ actual[i];
  return difference === 0;
}
