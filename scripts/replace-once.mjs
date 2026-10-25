// Scripted text edits that fail loudly. Reads a JSON list from stdin: [{ "file": "...", "old": "...", "new": "..." }].
// Every `old` must occur exactly once in its file (zero means the text moved or was reformatted, two or more means the wrong place could be edited).
// All edits are checked first and written only if every one passes, then it prints EDIT-OK; otherwise it names the failure, writes nothing, and exits 1.
// Usage: node scripts/replace-once.mjs <<'JSON' ... JSON
import { readFileSync, writeFileSync } from 'node:fs';

const edits = JSON.parse(readFileSync(0, 'utf8'));
const texts = new Map();
const problems = [];
for (const [i, { file, old, new: next }] of edits.entries()) {
  if (
    typeof file !== 'string' ||
    typeof old !== 'string' ||
    typeof next !== 'string' ||
    old === ''
  ) {
    problems.push(
      `edit ${i + 1}: needs file, old (not empty) and new as strings`,
    );
    continue;
  }
  if (!texts.has(file)) texts.set(file, readFileSync(file, 'utf8'));
  const text = texts.get(file);
  const count = text.split(old).length - 1;
  if (count !== 1) {
    problems.push(
      `edit ${i + 1} (${file}): found ${count} matches of ${JSON.stringify(old.slice(0, 60))}, need exactly 1`,
    );
    continue;
  }
  texts.set(
    file,
    text.replace(old, () => next),
  );
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
for (const [file, text] of texts) writeFileSync(file, text);
console.log('EDIT-OK');
