// Writes content/lists/tailors.yml and products.yml from D1, so the content editor (/cms) can offer each tailor and product in a dropdown (FR-CMS-04).
// Run it after adding a tailor or product, then commit and push the two files.
// Usage: npm run cms:lists                                  (this computer's database)
//        npm run cms:lists -- --remote --env staging        (the staging database)
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { renderList } from './cms-lists-lib.mjs';

const args = process.argv.slice(2);
const env = args.includes('--env')
  ? args[args.indexOf('--env') + 1]
  : undefined;
if (
  args.includes('--remote') &&
  !['staging', 'production'].includes(env ?? '')
) {
  console.error('--remote needs --env staging or --env production.');
  process.exit(1);
}
const target = args.includes('--remote')
  ? ['--remote', '--env', env]
  : ['--local'];
const query = (sql) => {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'DB', ...target, '--json', '--command', sql],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
};

// Archived tailors are left out; drafts are kept so photos can be ready before a tailor is published (publishing still decides what shows).
const tailors = query(
  "SELECT slug, display_name AS name FROM tailor WHERE status != 'archived' ORDER BY display_name",
);
const products = query('SELECT slug, name FROM product ORDER BY name');
writeFileSync('content/lists/tailors.yml', renderList('tailors', tailors));
writeFileSync('content/lists/products.yml', renderList('products', products));
console.log(
  `cms:lists: ${tailors.length} tailors and ${products.length} products written to content/lists/. Commit and push them.`,
);
