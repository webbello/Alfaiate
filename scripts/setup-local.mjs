// `npm run setup:local`: first-time local setup. Creates .dev.vars with fresh random secrets (never committed), applies the
// migrations to the local database and adds the placeholder categories and areas. Safe to run again: it never overwrites .dev.vars.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { renderDevVars } from './setup-local-lib.mjs';

if (existsSync('.dev.vars')) {
  console.log('.dev.vars already exists: left as it is.');
} else {
  writeFileSync(
    '.dev.vars',
    renderDevVars(readFileSync('.dev.vars.example', 'utf8'), () =>
      randomBytes(24).toString('hex'),
    ),
    { mode: 0o600 },
  );
  console.log('Created .dev.vars with fresh random secrets.');
}
for (const args of [
  ['d1', 'migrations', 'apply', 'DB', '--local'],
  ['d1', 'execute', 'DB', '--local', '--file=seeds/placeholders.sql'],
])
  if (
    spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit' }).status !== 0
  )
    process.exit(1);
console.log(
  '\nNext: npm run owner:create  (choose the admin email and password, they are never stored in plain text), then npm run dev.',
);
