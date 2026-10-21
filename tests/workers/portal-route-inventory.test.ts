import { describe, expect, it } from 'vitest';
import { PORTAL_ROUTES } from '../../src/modules/portal/routes';

const sources = import.meta.glob('../../src/pages/portal/**/*.{astro,ts}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const files = Object.keys(sources)
  .map((p) => p.split('/pages/portal/')[1])
  .sort();

describe('portal route inventory (SEC-09, FR-TPO-03)', () => {
  it('lists every file under src/pages/portal, so a new route cannot be added unguarded', () => {
    expect(files).toEqual(PORTAL_ROUTES.map((r) => r.file).sort());
  });
  it('calls requireTailor in every tailor file, and uses no staff permission anywhere in the portal', () => {
    for (const route of PORTAL_ROUTES) {
      const source = sources[`../../src/pages/portal/${route.file}`];
      if (route.access === 'tailor')
        expect(source, route.file).toContain('requireTailor(');
      expect(source, route.file).not.toContain('requirePermission');
    }
  });
  it('opts every portal file out of prerendering', () => {
    for (const route of PORTAL_ROUTES)
      expect(
        sources[`../../src/pages/portal/${route.file}`],
        route.file,
      ).toContain('export const prerender = false');
  });
  it('keeps the public pages free of tailor data queries', () => {
    for (const route of PORTAL_ROUTES.filter((r) => r.access === 'public'))
      expect(
        sources[`../../src/pages/portal/${route.file}`],
        route.file,
      ).not.toMatch(/FROM tailor\b(?!_)/);
  });
});
