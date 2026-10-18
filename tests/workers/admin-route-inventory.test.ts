import { describe, expect, it } from 'vitest';
import { ADMIN_ROUTES } from '../../src/modules/auth/admin-routes';
import { PERMISSIONS } from '../../src/modules/auth/permissions';

const sources = import.meta.glob('../../src/pages/admin/**/*.{astro,ts}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const files = Object.keys(sources)
  .map((p) => p.split('/pages/admin/')[1])
  .sort();

describe('admin route inventory (SEC-09, AC-09)', () => {
  it('lists every file under src/pages/admin, so a new route cannot be added without a declared permission', () => {
    expect(files).toEqual(ADMIN_ROUTES.map((r) => r.file).sort());
  });

  it('names only permissions that exist', () => {
    for (const route of ADMIN_ROUTES) {
      if (route.permission !== null)
        expect(PERMISSIONS).toContain(route.permission);
    }
  });

  it('has a server-side requirePermission call with the declared permission in every protected file', () => {
    for (const route of ADMIN_ROUTES) {
      const source = sources[`../../src/pages/admin/${route.file}`];
      if (route.permission === null) continue;
      expect(source, route.file).toContain(`requirePermission(`);
      expect(source, route.file).toContain(`'${route.permission}'`);
    }
  });

  it('only the login page is public, and it is declared as such', () => {
    expect(
      ADMIN_ROUTES.filter((r) => r.permission === null).map((r) => r.path),
    ).toEqual(['/admin/login']);
  });

  it('opts every admin file out of prerendering, so the middleware and guard always run', () => {
    for (const route of ADMIN_ROUTES) {
      expect(
        sources[`../../src/pages/admin/${route.file}`],
        route.file,
      ).toContain('export const prerender = false');
    }
  });
});
