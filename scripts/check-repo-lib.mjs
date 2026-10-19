// Rules for `npm run check:repo`. Pure functions (no Node imports) so tests can run them anywhere.
// Findings name the file and the rule, never the secret itself.
const FILE_RULES = [
  [/(^|\/)\.env(\.[^/]*)?$/, 'environment file', (p) => !/\.example$/.test(p)],
  [/(^|\/)\.dev\.vars$/, 'local variables file (secrets)'],
  [/\.(sqlite3?|db)$/i, 'database file'],
  [
    /\.(dump|zip|tar|gz|tgz|7z|bak)$/i,
    'archive or dump (could hold a database or customer data)',
  ],
  [/\.(pem|key|p12|pfx)$/i, 'key or certificate file'],
  [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/, 'ssh key'],
  [/(^|\/)uploads\//, 'uploads directory'],
  [/(^|\/)(\.wrangler|dist|node_modules)\//, 'build output or local state'],
  // Photos of customers or tailors must never reach git. (No image is tracked today; an allow-list entry would need the owner's approval.)
  [/\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp)$/i, 'image file'],
];

const CONTENT_RULES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/xox[abposr]-[0-9A-Za-z-]{10,}/, 'Slack token'],
  [/sk_live_[0-9A-Za-z]{20,}/, 'Stripe live key'],
];

/** @param {{ path: string, text: string | null }[]} files Tracked files; `text` is null for files that are not readable text. */
export function findProblems(files) {
  const problems = [];
  for (const { path, text } of files) {
    for (const [pattern, label, applies] of FILE_RULES)
      if (pattern.test(path) && (!applies || applies(path)))
        problems.push(`${path}: ${label} must not be tracked`);
    if (text === null) continue;
    for (const [pattern, label] of CONTENT_RULES)
      if (pattern.test(text)) problems.push(`${path}: contains a ${label}`);
  }
  return problems;
}
