// Builds nothing: run `npm run build` first (the npm script does). Starts the built Worker on a throwaway local D1
// with fake data and Tetum switched on, runs Playwright against it, then stops the Worker and deletes the data.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/modules/auth/password.ts';

const PORT = 8799;
const state = mkdtempSync(join(tmpdir(), 'alfaiate-e2e-'));
const wrangler = (args) =>
  spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit' });
if (
  await fetch(`http://localhost:${PORT}`).then(
    () => true,
    () => false,
  )
) {
  console.error(`Port ${PORT} is already in use; stop that server first.`);
  process.exit(1);
}
let server;
const stop = () => {
  server?.kill('SIGTERM');
  rmSync(state, { recursive: true, force: true });
};
process.on('SIGINT', () => (stop(), process.exit(130)));

try {
  for (const args of [
    ['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state],
    [
      'd1',
      'execute',
      'DB',
      '--local',
      '--persist-to',
      state,
      '--file=seeds/placeholders.sql',
    ],
    [
      'd1',
      'execute',
      'DB',
      '--local',
      '--persist-to',
      state,
      '--file=e2e/seed.sql',
    ],
  ])
    if (wrangler(args).status !== 0) throw new Error('database setup failed');

  // A throwaway owner for the admin pages. The password exists only in this run, and only its hash reaches the database.
  const adminPassword = `${randomUUID()}-${randomUUID()}`;
  const adminHash = await hashPassword(adminPassword, 1000);
  if (
    wrangler([
      'd1',
      'execute',
      'DB',
      '--local',
      '--persist-to',
      state,
      '--command',
      `INSERT INTO admin_user (email, password_hash, role) VALUES ('e2e-owner@example.test', '${adminHash}', 'owner')`,
    ]).status !== 0
  )
    throw new Error('admin setup failed');

  server = spawn(
    'npx',
    [
      'wrangler',
      'dev',
      '--port',
      String(PORT),
      '--persist-to',
      state,
      '--var',
      'PUBLIC_LANGUAGES:en,tet',
      '--var',
      `FORM_TOKEN_SECRET:${randomUUID()}${randomUUID()}`,
      '--var',
      `SITE_URL:http://localhost:${PORT}`,
    ],
    { stdio: 'ignore' },
  );
  const url = `http://localhost:${PORT}`;
  for (let i = 0; ; i++) {
    if (i > 60) throw new Error('Worker did not start');
    if (
      await fetch(url).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const result = spawnSync(
    'npx',
    ['playwright', 'test', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        E2E_BASE_URL: url,
        E2E_ADMIN_EMAIL: 'e2e-owner@example.test',
        E2E_ADMIN_PASSWORD: adminPassword,
      },
    },
  );
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  stop();
}
