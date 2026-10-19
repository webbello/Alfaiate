// `npm run check:repo`: fails if git tracks anything that looks like a secret, an environment file, a database, an upload or a photo.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { findProblems } from './check-repo-lib.mjs';

const MAX_BYTES = 1_000_000;
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const readable = (path) => {
  try {
    if (statSync(path).size > MAX_BYTES) return null;
    const bytes = readFileSync(path);
    return bytes.includes(0) ? null : bytes.toString('utf8');
  } catch {
    return null; // deleted in the working tree but still listed
  }
};

const problems = findProblems(
  tracked.map((path) => ({ path, text: readable(path) })),
);
if (problems.length > 0) {
  console.error(`check:repo found ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(
  `check:repo: ${tracked.length} tracked files, no secrets, databases, uploads or photos.`,
);
