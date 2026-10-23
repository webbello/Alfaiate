// Demo data is for the LOCAL database only. These helpers build the wrangler commands and refuse anything that could reach a remote database.
const LOCAL = ['d1', 'execute', 'DB', '--local'];
const REMOVE = ['seeds/demo-remove.sql'];
const LAUNCH = ['seeds/launch.sql'];
const ADD = ['seeds/demo.sql'];

/** The wrangler argument lists to run, in order. `add` clears earlier demo rows first so running it twice never duplicates. */
export function demoSteps(mode, extraArgs = []) {
  if (extraArgs.length > 0)
    throw new Error(
      `Demo data takes no options (got ${extraArgs.join(' ')}): it only ever touches the local database.`,
    );
  const files =
    mode === 'add'
      ? [...REMOVE, ...LAUNCH, ...ADD]
      : mode === 'remove'
        ? REMOVE
        : null;
  if (!files) throw new Error('Usage: node scripts/demo.mjs add|remove');
  return files.map((f) => [...LOCAL, `--file=${f}`]);
}
