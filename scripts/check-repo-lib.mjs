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
  // Photos of customers or tailors must never reach git. The only exception is the credited scene photos below (owner-approved 2026-10-19).
  [/\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp)$/i, 'image file'],
];

const CONTENT_RULES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/xox[abposr]-[0-9A-Za-z-]{10,}/, 'Slack token'],
  [/sk_live_[0-9A-Za-z]{20,}/, 'Stripe live key'],
];

// Licensed scene photos (owner decision 2026-10-19): `public/images/site/<name>-<width>.webp` is allowed only when <name> is listed in
// `public/images/site/CREDITS.md` as `| <name> |`. Tailor and customer photos never go here: they live in R2.
const SITE_PHOTO = /^public\/images\/site\/([a-z0-9-]+?)-\d+\.webp$/;
const CREDITS = 'public/images/site/CREDITS.md';
// The three home-screen icons of the admin (FR-ADM-19) are drawn by scripts/make-admin-icons.mjs (a letter and a line, no photograph): exactly these names are allowed.
const APP_ICON = /^public\/admin-icon-(180|192|512)\.png$/;
function creditedPhotos(files) {
  const text = files.find((f) => f.path === CREDITS)?.text ?? '';
  // only the first column of a table row is a name; a lowercase word anywhere else must not credit a file
  const names = new Set(
    [...text.matchAll(/^\|\s*([a-z0-9-]+)\s*\|/gm)].map((m) => m[1]),
  );
  return (path) => {
    const m = SITE_PHOTO.exec(path);
    return (m !== null && names.has(m[1])) || APP_ICON.test(path);
  };
}

/** @param {{ path: string, text: string | null }[]} files Tracked files; `text` is null for files that are not readable text. */
export function findProblems(files) {
  const problems = [];
  const credited = creditedPhotos(files);
  for (const { path, text } of files) {
    for (const [pattern, label, applies] of FILE_RULES)
      if (label === 'image file' && credited(path)) continue;
      else if (pattern.test(path) && (!applies || applies(path)))
        problems.push(`${path}: ${label} must not be tracked`);
    if (text === null) continue;
    for (const [pattern, label] of CONTENT_RULES)
      if (pattern.test(text)) problems.push(`${path}: contains a ${label}`);
  }
  return problems;
}
