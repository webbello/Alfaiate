// Prints PBKDF2-SHA-256 timing per iteration count (AD-03). Runs in Node, so numbers are indicative only;
// the Workers CPU limit applies to workerd (Free 10 ms, Paid 30 s default per Cloudflare's limits page).
import { webcrypto as crypto } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { TextEncoder } from 'node:util';

const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode('benchmark-password'),
  'PBKDF2',
  false,
  ['deriveBits'],
);
const salt = crypto.getRandomValues(new Uint8Array(16));

for (const iterations of [100_000, 210_000, 600_000, 1_000_000]) {
  const times = [];
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      key,
      256,
    );
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(
    `${String(iterations).padStart(9)} iterations: median ${times[3].toFixed(1)} ms (min ${times[0].toFixed(1)}, max ${times[6].toFixed(1)})`,
  );
}
