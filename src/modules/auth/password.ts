// PBKDF2-HMAC-SHA-256 via WebCrypto (AD-03). Stored as: pbkdf2-sha256$<iterations>$<salt>$<hash>.
// shortcut: PBKDF2 is not memory-hard; revisit if the owner moves to scrypt/argon2 (needsRehash upgrades hashes at login).
const ALGORITHM = 'pbkdf2-sha256';
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const MAX_ACCEPTED_ITERATIONS = 10_000_000; // refuse absurd stored values instead of burning CPU

/** OWASP's figure for PBKDF2-HMAC-SHA-256. Needs the Workers Paid CPU limit (AD-02); see DECISIONS.md. */
export const DEFAULT_ITERATIONS = 600_000;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BYTES * 8);
  return new Uint8Array(bits);
}

function parse(stored: string) {
  const [algorithm, iterationText, saltText, hashText, extra] = stored.split('$');
  const iterations = Number(iterationText);
  if (algorithm !== ALGORITHM || extra !== undefined || !hashText) return null;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ACCEPTED_ITERATIONS) return null;
  const salt = fromBase64Url(saltText);
  const hash = fromBase64Url(hashText);
  return salt && hash && salt.length > 0 && hash.length === HASH_BYTES ? { iterations, salt, hash } : null;
}

export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  if (!password) throw new Error('Password must not be empty');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `${ALGORITHM}$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/** Never throws on a bad stored value; returns false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed || !password) return false;
  const actual = await derive(password, parsed.salt, parsed.iterations);
  let difference = 0; // constant-time comparison
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ parsed.hash[i];
  return difference === 0;
}

/** True when the stored hash is malformed or uses fewer iterations than today's default. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.iterations < DEFAULT_ITERATIONS;
}
