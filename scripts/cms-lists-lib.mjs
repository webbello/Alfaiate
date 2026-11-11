// Pure part of `npm run cms:lists` (tested): turns D1 rows into the YAML lists the content editor uses for its tailor and product dropdowns.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// The content entries the tests use (FR-CMS-04) stay selectable, though no such tailor or product exists in D1.
export const EXAMPLES = {
  tailors: { slug: 'example-tailor', name: 'Example tailor (used by tests)' },
  products: {
    slug: 'example-product',
    name: 'Example product (used by tests)',
  },
};

/** @param {'tailors' | 'products'} key @param {{ slug: string, name: string }[]} rows */
export function renderList(key, rows) {
  const items = [
    ...rows.filter((r) => SLUG.test(r.slug) && r.slug !== EXAMPLES[key].slug),
    EXAMPLES[key],
  ];
  // JSON strings are valid YAML double-quoted strings, so a name with a colon or a quote cannot break the file.
  const lines = items.map(
    (r) =>
      `  - slug: ${r.slug}\n    name: ${JSON.stringify(
        String(r.name ?? r.slug)
          .replace(/\s+/g, ' ')
          .trim(),
      )}`,
  );
  return `# Written by \`npm run cms:lists\` from the database. Do not edit: the next run replaces it.\n${key}:\n${lines.join('\n')}\n`;
}
