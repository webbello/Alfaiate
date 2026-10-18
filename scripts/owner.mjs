// Owner account recovery (PRD §11: password reset is out-of-band, by the developer).
//   npm run owner:create -- [--email you@example.com]
//   npm run owner:reset  -- [--email you@example.com]
// Local D1 by default. Passwords are typed without echo, hashed here, and never printed, logged or written to disk;
// only the hash goes to a temp file (mode 600) that is deleted afterwards. --password-stdin is for automation.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stdin, stdout, stderr, argv, exit } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../src/modules/auth/password.ts';
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

const target = flag('remote')
  ? ['--remote']
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
    'Usage: owner.mjs create|reset [--email <address>] [--remote] [--password-stdin]',
  );
if (flag('remote')) {
  if (flag('password-stdin'))
    fail('--remote needs an interactive terminal for its confirmation.');
  if (
    (
      await ask(
        'This changes the REMOTE (production) database. Type "remote" to continue: ',
      )
    ).trim() !== 'remote'
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
  const hash = await hashPassword(validatePassword(await readPassword()));
  runFile(
    command === 'create'
      ? buildCreateSql(email, hash)
      : buildResetSql(email, hash),
  );
  const done =
    query(
      `SELECT count(*) AS c FROM admin_user WHERE email = '${email}' AND password_hash = '${hash}'`,
    )[0].c === 1;
  if (!done) fail('The change was not applied.');
  stdout.write(
    command === 'create'
      ? `Owner created: ${email}\n`
      : `Password reset for ${email}; all their sessions ended.\n`,
  );
} catch (error) {
  fail(error instanceof Error ? error.message.split('\n')[0] : 'Failed.');
}
