// Builds nothing: run `npm run build` first (the npm script does). Starts the built Worker on a throwaway seeded database,
// runs Playwright against it, then stops the Worker and deletes the data.
import { spawnSync } from 'node:child_process';
import { ADMIN_EMAIL, startWorker } from './serve.mjs';

let worker;
try {
  worker = await startWorker();
  const result = spawnSync(
    'npx',
    ['playwright', 'test', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        E2E_BASE_URL: worker.url,
        E2E_ADMIN_EMAIL: ADMIN_EMAIL,
        E2E_ADMIN_PASSWORD: worker.adminPassword,
      },
    },
  );
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  worker?.stop();
}
