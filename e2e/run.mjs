// Builds nothing: run `npm run build` first (the npm script does). Starts the built Worker on a throwaway local D1
// with fake data and Tetum switched on, runs Playwright against it, then stops the Worker and deletes the data.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8799;
const state = mkdtempSync(join(tmpdir(), 'alfaiate-e2e-'));
const wrangler = (args) =>
  spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit' });
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
    { stdio: 'inherit', env: { ...process.env, E2E_BASE_URL: url } },
  );
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  stop();
}
