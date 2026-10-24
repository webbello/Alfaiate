// `wrangler types` merges every environment, so the photo buckets (absent from the free-plan staging/production) come out optional.
// Local development and the tests always bind them; the app reads them only through requireBindings(), which handles their absence.
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'worker-configuration.d.ts';
const before = readFileSync(file, 'utf8');
const after = before.replace(
  /\b(MEDIA_PUBLIC|MEDIA_PRIVATE)\?: R2Bucket;/g,
  '$1: R2Bucket;',
);
if (after === before)
  throw new Error('fix-types: no optional bucket binding found to fix');
writeFileSync(file, after);
