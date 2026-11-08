/**
 * The small slice of YAML that Sveltia CMS writes at the top of a journal article or author file (docs/SPEC-sveltia-cms.md): `key: value` lines with plain, quoted
 * or block (`|`, `>`) text, true/false, and lists of plain items. A key with an object or a list of objects after it is read as null and its indented lines are skipped.
 * Not a YAML parser: anything else is kept as plain text, never run.
 */
export type Scalar = string | boolean | null | string[];
export type Frontmatter = { data: Record<string, Scalar>; body: string };

const unquote = (raw: string): string => {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2)
    return raw
      .slice(1, -1)
      .replace(/\\(["\\/nt])/g, (_, c: string) =>
        c === 'n' ? '\n' : c === 't' ? '\t' : c,
      );
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
    return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
};

export function parseMapping(lines: string[]): Record<string, Scalar> {
  const data: Record<string, Scalar> = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(lines[i]!);
    if (!m) continue; // a continuation or nested line that no key above claimed
    const key = m[1]!;
    const value = (m[2] ?? '').trim();
    const rest: string[] = [];
    while (i + 1 < lines.length && /^(\s+|\s*$)/.test(lines[i + 1]!)) {
      rest.push(lines[++i]!);
    }
    while (rest.length && rest[rest.length - 1]!.trim() === '') rest.pop();
    const block = /^([|>])[+-]?$/.exec(value);
    if (block) {
      const text = rest.map((l) => l.replace(/^\s+/, ''));
      data[key] = block[1] === '|' ? text.join('\n') : text.join(' ').trim();
    } else if (value === '') {
      // a list of plain items ("- text") is read; any other nested list or object is not (null)
      const items = rest.map((l) => l.trim()).filter((l) => l !== '');
      data[key] =
        items.length > 0 && items.every((l) => /^-\s+[^:]*$/.test(l))
          ? items.map((l) => unquote(l.replace(/^-\s+/, '').trim()))
          : null;
    } else {
      const whole = [value, ...rest.map((l) => l.trim())].join(' ').trim();
      data[key] =
        whole === 'true'
          ? true
          : whole === 'false'
            ? false
            : whole === 'null' || whole === '~'
              ? null
              : unquote(whole);
    }
  }
  return data;
}

/** A Markdown file with `---` front matter, or (no fence) a plain YAML file with an empty body. */
export function parseFrontmatter(raw: string): Frontmatter {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.startsWith('---\n'))
    return { data: parseMapping(text.split('\n')), body: '' };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { data: {}, body: text };
  const after = text.indexOf('\n', end + 4);
  return {
    data: parseMapping(text.slice(4, end).split('\n')),
    body: after === -1 ? '' : text.slice(after + 1).trim(),
  };
}
