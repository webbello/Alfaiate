// npm run deploy:staging | deploy:production
// Builds for that environment and deploys in one go, then refuses to deploy a build made for another one: `npm run check` and the e2e tests rebuild
// dist/ for the practice (local) setup, and deploying that fails with "R2 bucket not found" or the wrong worker name (docs/DEPLOY.md).
// While it runs it holds .deploy.lock, so the Stop hook does not start `npm run check` (which rebuilds dist/) in the middle of a deploy.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const WORKERS = {
  staging: 'alfaiate-tl-staging',
  production: 'alfaiate-tl-production',
};
const target = process.argv[2];
if (!(target in WORKERS)) {
  console.error('Usage: node scripts/deploy.mjs staging|production');
  process.exit(1);
}

const LOCK = '.deploy.lock';
writeFileSync(LOCK, String(process.pid));
const unlock = () => rmSync(LOCK, { force: true });
process.on('exit', unlock);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => process.exit(130));

const run = (command, args, env = {}) =>
  spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  }).status ?? 1;

if (run('npm', ['run', 'build'], { CLOUDFLARE_ENV: target }) !== 0)
  process.exit(1);
const built = existsSync('dist/server/wrangler.json')
  ? JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8')).name
  : undefined;
if (built !== WORKERS[target]) {
  console.error(
    `Stopped: the build is for "${built}", not "${WORKERS[target]}". Nothing was deployed.`,
  );
  process.exit(1);
}
process.exit(run('npx', ['wrangler', 'deploy']));
