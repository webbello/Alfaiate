// PBKDF2-HMAC-SHA-256 via WebCrypto (AD-03). Stored as: pbkdf2-sha256$<iterations>$<salt>$<hash>.
// shortcut: PBKDF2 is not memory-hard; revisit if the owner moves to scrypt/argon2 (needsRehash upgrades hashes at login).
const ALGORITHM = 'pbkdf2-sha256';
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const MAX_ACCEPTED_ITERATIONS = 10_000_000; // refuse absurd stored values instead of burning CPU

/** OWASP's figure for PBKDF2-HMAC-SHA-256. Needs the Workers Paid CPU limit (AD-02); see DECISIONS.md. */
export const DEFAULT_ITERATIONS = 600_000;

// Free-plan mode: the Workers Free plan gives about 10 ms of CPU per request, too little for 600000 rounds. The deployment can set
// PASSWORD_ITERATIONS (for example 100000) instead; every hash records its own count, and a sign-in upgrades a hash that has
// fewer rounds than today's setting, so raising the setting later (Workers Paid) strengthens each password the next time it is used.
const MIN_CONFIGURED_ITERATIONS = 20_000;
let target = DEFAULT_ITERATIONS;

/** Reads the PASSWORD_ITERATIONS setting. A missing or unusable value keeps the strong default, never a weaker one by accident. */
export function configurePasswordIterations(
  value: string | number | null | undefined,
): number {
  const n = Number(value);
  target =
    Number.isInteger(n) &&
    n >= MIN_CONFIGURED_ITERATIONS &&
    n <= DEFAULT_ITERATIONS
      ? n
      : DEFAULT_ITERATIONS;
  return target;
}
export const passwordIterations = () => target;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function parse(stored: string) {
  const [algorithm, iterationText, saltText, hashText, extra] =
    stored.split('$');
  const iterations = Number(iterationText);
  if (algorithm !== ALGORITHM || extra !== undefined || !hashText) return null;
  if (
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > MAX_ACCEPTED_ITERATIONS
  )
    return null;
  const salt = fromBase64Url(saltText);
  const hash = fromBase64Url(hashText);
  return salt && hash && salt.length > 0 && hash.length === HASH_BYTES
    ? { iterations, salt, hash }
    : null;
}

export async function hashPassword(
  password: string,
  iterations = target,
): Promise<string> {
  if (!password) throw new Error('Password must not be empty');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `${ALGORITHM}$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/** Never throws on a bad stored value; returns false. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed || !password) return false;
  const actual = await derive(password, parsed.salt, parsed.iterations);
  let difference = 0; // constant-time comparison
  for (let i = 0; i < actual.length; i++)
    difference |= actual[i] ^ parsed.hash[i];
  return difference === 0;
}

/** True when the stored hash is malformed or uses fewer iterations than today's setting. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.iterations < target;
}

const DUMMY_SALT = new Uint8Array(SALT_BYTES).fill(
  7,
) as Uint8Array<ArrayBuffer>;
/** For an unknown or inactive user: spend the same time as a real check at today's setting, then say no. */
export async function dummyVerify(password: string): Promise<boolean> {
  await derive(password, DUMMY_SALT, target);
  return false;
}
