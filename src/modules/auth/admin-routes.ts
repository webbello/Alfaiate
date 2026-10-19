import type { Permission } from './permissions';

/**
 * Every file under src/pages/admin must be listed here with the permission it enforces (SEC-09, AC-09).
 * tests/workers/admin-route-inventory.test.ts fails if a file is missing from this list or unguarded;
 * tests/integration/admin.test.ts requests each entry anonymously. `null` is only for the login page.
 */
export const ADMIN_ROUTES: readonly {
  file: string;
  path: string;
  permission: Permission | null;
  methods: readonly ('GET' | 'POST')[];
}[] = [
  {
    file: 'login.astro',
    path: '/admin/login',
    permission: null,
    methods: ['GET', 'POST'],
  },
  {
    file: 'logout.ts',
    path: '/admin/logout',
    permission: 'dashboard.view',
    methods: ['POST'],
  },
  {
    file: 'index.astro',
    path: '/admin',
    permission: 'dashboard.view',
    methods: ['GET'],
  },
  {
    file: 'account.astro',
    path: '/admin/account',
    permission: 'dashboard.view',
    methods: ['GET', 'POST'],
  },
  {
    file: 'users.astro',
    path: '/admin/users',
    permission: 'user.manage',
    methods: ['GET'],
  },
  {
    file: 'users/actions.ts',
    path: '/admin/users/actions',
    permission: 'user.manage',
    methods: ['POST'],
  },
  {
    file: 'categories.astro',
    path: '/admin/categories',
    permission: 'tailor.edit',
    methods: ['GET', 'POST'],
  },
  {
    file: 'areas.astro',
    path: '/admin/areas',
    permission: 'tailor.edit',
    methods: ['GET', 'POST'],
  },
];

/** Fills the dynamic segments of a route template ([id], [...key]) so tests can request it. */
export function concretePath(
  path: string,
  params: { id?: number | string; key?: string },
): string {
  return path
    .replace('[id]', String(params.id ?? ''))
    .replace('[...key]', params.key ?? '');
}
