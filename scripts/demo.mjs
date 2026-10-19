// `npm run db:demo` / `npm run db:demo:remove`: fill or empty the LOCAL database with clearly fake demo data.
import { spawnSync } from 'node:child_process';
import { demoSteps } from './demo-lib.mjs';

let steps;
try {
  steps = demoSteps(process.argv[2], process.argv.slice(3));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
for (const args of steps)
  if (
    spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit' }).status !== 0
  )
    process.exit(1);
console.log(
  process.argv[2] === 'add'
    ? 'Demo data loaded (local database only). Remove it with: npm run db:demo:remove'
    : 'Demo data removed from the local database.',
);
