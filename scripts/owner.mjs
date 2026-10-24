// Owner account recovery (PRD §11: password reset is out-of-band, by the developer).
//   npm run owner:create -- [--email you@example.com]
//   npm run owner:reset  -- [--email you@example.com]
// Deployed database: add `--remote --env production` (or `--env staging`); see docs/DEPLOY.md. Local D1 by default. Passwords are typed without echo, hashed here, and never printed, logged or written to disk;
// only the hash goes to a temp file (mode 600) that is deleted afterwards. --password-stdin is for automation.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stdin, stdout, stderr, argv, exit } from 'node:process';
import { createInterface } from 'node:readline/promises';
import {
  configurePasswordIterations,
  hashPassword,
  passwordIterations,
} from '../src/modules/auth/password.ts';
import {
  buildCreateSql,
  buildResetSql,
  validateEmail,
  validatePassword,
} from './owner-lib.mjs';

const [command, ...args] = argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function fail(message) {
  stderr.write(`${message}\n`);
  exit(1);
}

async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') exit(130);
        value = ch === '\u007f' ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPassword() {
  if (flag('password-stdin')) {
    const rl = createInterface({ input: stdin });
    for await (const line of rl) return line;
    return '';
  }
  if (!stdin.isTTY)
    fail(
      'No terminal available. Use --password-stdin to pipe the password in.',
    );
  const first = await askHidden('Password (at least 12 characters): ');
  const second = await askHidden('Repeat password: ');
  if (first !== second) fail('The passwords do not match.');
  return first;
}

const remoteEnv = option('env');
// Free-plan mode: use the same PASSWORD_ITERATIONS the deployed Worker uses (from wrangler.jsonc, or the shell), so the owner can sign in within the free CPU limit.
function configuredIterations() {
  if (process.env.PASSWORD_ITERATIONS) return process.env.PASSWORD_ITERATIONS;
  try {
    const config = JSON.parse(
      readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''),
    );
    return (remoteEnv ? config.env?.[remoteEnv] : config)?.vars
      ?.PASSWORD_ITERATIONS;
  } catch {
    return undefined;
  }
}
configurePasswordIterations(configuredIterations());
if (flag('remote') && !['staging', 'production'].includes(remoteEnv ?? ''))
  fail('--remote needs --env staging or --env production.');
const target = flag('remote')
  ? ['--remote', '--env', remoteEnv]
  : [
      '--local',
      ...(option('persist-to') ? ['--persist-to', option('persist-to')] : []),
    ];
const wrangler = (...extra) =>
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'DB', ...target, ...extra],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

function query(sql) {
  const out = wrangler('--json', '--command', sql);
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

function runFile(sql) {
  const dir = mkdtempSync(join(tmpdir(), 'alfaiate-owner-'));
  const file = join(dir, 'owner.sql');
  try {
    writeFileSync(file, sql, { mode: 0o600 });
    wrangler('--file', file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (!['create', 'reset'].includes(command))
  fail(
    'Usage: owner.mjs create|reset [--email <address>] [--remote --env staging|production] [--password-stdin]',
  );
if (flag('remote')) {
  if (flag('password-stdin'))
    fail('--remote needs an interactive terminal for its confirmation.');
  if (
    (
      await ask(
        `This changes the REMOTE ${remoteEnv} database. Type "${remoteEnv}" to continue: `,
      )
    ).trim() !== remoteEnv
  )
    fail('Cancelled.');
}

try {
  const email = validateEmail(option('email') ?? (await ask('Owner email: ')));
  if (
    command === 'create' &&
    query(
      "SELECT count(*) AS c FROM admin_user WHERE role = 'owner' AND is_active = 1",
    )[0].c > 0
  ) {
    fail(
      'An active owner already exists. Sign in and add users at /admin/users, or use owner:reset.',
    );
  }
  if (
    command === 'reset' &&
    query(`SELECT count(*) AS c FROM admin_user WHERE email = '${email}'`)[0]
      .c === 0
  ) {
    fail('No user with that email.');
  }
  stderr.write(`Password rounds: ${passwordIterations()}\n`);
  const hash = await hashPassword(validatePassword(await readPassword()));
  runFile(
    command === 'create'
      ? buildCreateSql(email, hash)
      : buildResetSql(email, hash),
  );
  // Compared in Node, so the hash is never put on a command line (visible in `ps`).
  const stored = query(
    `SELECT password_hash FROM admin_user WHERE email = '${email}'`,
  )[0]?.password_hash;
  const done = stored === hash;
  if (!done) fail('The change was not applied.');
  stdout.write(
    command === 'create'
      ? `Owner created: ${email}\n`
      : `Password reset for ${email}; all their sessions ended.\n`,
  );
} catch (error) {
  fail(error instanceof Error ? error.message.split('\n')[0] : 'Failed.');
}
