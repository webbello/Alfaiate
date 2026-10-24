// Pure helper for `npm run setup:local`: turns .dev.vars.example into a working .dev.vars by replacing the placeholder secrets.
const SECRET_KEYS = ['FORM_TOKEN_SECRET'];

/** @param {string} example text of .dev.vars.example  @param {() => string} makeSecret returns a fresh random secret */
export function renderDevVars(example, makeSecret) {
  return example
    .split('\n')
    .map((line) => {
      const key = line.split('=')[0];
      return SECRET_KEYS.includes(key) && !line.startsWith('#')
        ? `${key}=${makeSecret()}`
        : line;
    })
    .join('\n');
}
