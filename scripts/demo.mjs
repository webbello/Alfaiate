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
const shop = (mode) => spawnSync('node', ['scripts/demo-shop.mjs', mode], { stdio: 'inherit' }).status === 0;
if (process.argv[2] === 'remove' && !shop('remove')) process.exit(1);
for (const args of steps)
  if (
    spawnSync('npx', ['--no-install', 'wrangler', ...args], { stdio: 'inherit' }).status !== 0
  )
    process.exit(1);
if (process.argv[2] === 'add' && !shop('add')) process.exit(1);
console.log(
  process.argv[2] === 'add'
    ? 'Demo data loaded (local database only). Remove it with: npm run db:demo:remove'
    : 'Demo data removed from the local database.',
);
