import { hit, ipBucket } from '../auth/rate-limit';

// Spam controls for the public form (SEC-07, AC-08): a hidden field, a signed fill-time token and a per-address limit.
export const HONEYPOT_FIELD = 'extra_info'; // not an autofill-friendly name (website, email, phone), so a real customer's browser never fills it;
export const SUBMIT_LIMIT = 5;
export const MIN_FILL_SECONDS = 3;
export const MAX_AGE_SECONDS = 24 * 60 * 60;
const WINDOW_SECONDS = 60 * 60;

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const fromHex = (hex: string): Uint8Array<ArrayBuffer> | null =>
  /^([0-9a-f]{2})+$/.test(hex)
    ? Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16))
    : null;
const key = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );

/** `<seconds>.<hmac>`: proves when the form was shown, so a bot cannot pick its own time. */
export async function issueToken(
  secret: string,
  now = new Date(),
): Promise<string> {
  const ts = String(Math.floor(now.getTime() / 1000));
  const sig = await crypto.subtle.sign(
    'HMAC',
    await key(secret, 'sign'),
    new TextEncoder().encode(ts),
  );
  return `${ts}.${toHex(sig)}`;
}

export async function checkToken(
  secret: string,
  token: string,
  now = new Date(),
): Promise<'ok' | 'too_fast' | 'invalid'> {
  const [ts, sig, ...extra] = token.split('.');
  const bytes = sig ? fromHex(sig) : null;
  if (!/^[0-9]{1,12}$/.test(ts ?? '') || !bytes || extra.length > 0)
    return 'invalid';
  // verify() compares in constant time
  const genuine = await crypto.subtle.verify(
    'HMAC',
    await key(secret, 'verify'),
    bytes,
    new TextEncoder().encode(ts),
  );
  if (!genuine) return 'invalid';
  const age = Math.floor(now.getTime() / 1000) - Number(ts);
  if (age < 0 || age > MAX_AGE_SECONDS) return 'invalid';
  return age < MIN_FILL_SECONDS ? 'too_fast' : 'ok';
}

/** People never see this field; anything in it means a script filled in every input. */
export const isHoneypotHit = (form: URLSearchParams): boolean =>
  (form.get(HONEYPOT_FIELD) ?? '') !== '';

/** Counts the attempt (valid or not). No address (local only) uses one shared bucket, so the limit never switches off. */
export async function checkSubmitRate(
  db: D1Database,
  address: string | undefined,
  now = new Date(),
): Promise<'ok' | 'limited'> {
  const bucket = address ? ipBucket(address) : 'unknown';
  return (await hit(db, `enquiry:${bucket}`, WINDOW_SECONDS, now)) >
    SUBMIT_LIMIT
    ? 'limited'
    : 'ok';
}
