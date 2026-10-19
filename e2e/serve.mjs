// Starts the built Worker (run `npm run build` first) on a throwaway local D1 with fake data, Tetum and indexing switched on.
// Shared by the browser tests (e2e/run.mjs) and the speed measurement (scripts/perf.mjs). `stop()` removes everything again.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/modules/auth/password.ts';

export const PORT = 8799;
export const ADMIN_EMAIL = 'e2e-owner@example.test';

export async function startWorker() {
  const url = `http://localhost:${PORT}`;
  if (
    await fetch(url).then(
      () => true,
      () => false,
    )
  )
    throw new Error(`Port ${PORT} is already in use; stop that server first.`);

  const state = mkdtempSync(join(tmpdir(), 'alfaiate-e2e-'));
  let server;
  const stop = () => {
    server?.kill('SIGTERM');
    rmSync(state, { recursive: true, force: true });
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(signal, () => (stop(), process.exit(130)));

  const wrangler = (args) =>
    spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit' });
  const d1 = (...rest) =>
    wrangler([
      'd1',
      'execute',
      'DB',
      '--local',
      '--persist-to',
      state,
      ...rest,
    ]);
  try {
    if (
      wrangler([
        'd1',
        'migrations',
        'apply',
        'DB',
        '--local',
        '--persist-to',
        state,
      ]).status !== 0
    )
      throw new Error('database setup failed');
    for (const file of ['seeds/placeholders.sql', 'e2e/seed.sql'])
      if (d1(`--file=${file}`).status !== 0)
        throw new Error('database setup failed');

    // A throwaway owner for the admin pages. The password exists only in this run, and only its hash reaches the database.
    const adminPassword = `${randomUUID()}-${randomUUID()}`;
    const adminHash = await hashPassword(adminPassword, 1000);
    if (
      d1(
        '--command',
        `INSERT INTO admin_user (email, password_hash, role) VALUES ('${ADMIN_EMAIL}', '${adminHash}', 'owner')`,
      ).status !== 0
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
        'SITE_INDEXABLE:true', // as in production, so structured data and social tags are on the pages that are measured and checked
        '--var',
        'JOIN_ENABLED:true', // the interest form is off by default (OQ-08); the browser tests exercise it
        '--var',
        'NEWSLETTER_ENABLED:true', // likewise the footer sign-up (OQ-06, OQ-08)
        '--var',
        `FORM_TOKEN_SECRET:${randomUUID()}${randomUUID()}`,
        '--var',
        `SITE_URL:${url}`,
      ],
      { stdio: 'ignore' },
    );
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
    return { url, adminPassword, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
