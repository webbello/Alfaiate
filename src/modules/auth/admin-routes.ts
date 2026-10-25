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
    file: 'theme.ts',
    path: '/admin/theme',
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
    file: 'search.astro',
    path: '/admin/search',
    permission: 'dashboard.view',
    methods: ['GET', 'POST'],
  },
  {
    file: 'interest.astro',
    path: '/admin/interest',
    permission: 'enquiry.view',
    methods: ['GET'],
  },
  {
    file: 'interest/[id]/approve.astro',
    path: '/admin/interest/[id]/approve',
    permission: 'tailor.publish',
    methods: ['POST'],
  },
  {
    file: 'interest/[id]/decline.ts',
    path: '/admin/interest/[id]/decline',
    permission: 'tailor.publish',
    methods: ['POST'],
  },
  {
    file: 'tailors/[id]/signin.ts',
    path: '/admin/tailors/[id]/signin',
    permission: 'tailor.publish',
    methods: ['POST'],
  },
  {
    file: 'tailors/[id]/orders.ts',
    path: '/admin/tailors/[id]/orders',
    permission: 'tailor.publish',
    methods: ['POST'],
  },
  {
    file: 'orders.astro',
    path: '/admin/orders',
    permission: 'enquiry.view',
    methods: ['GET'],
  },
  {
    file: 'tailors/[id]/invite.astro',
    path: '/admin/tailors/[id]/invite',
    permission: 'tailor.publish',
    methods: ['POST'],
  },
  {
    file: 'interest/[id]/anonymise.ts',
    path: '/admin/interest/[id]/anonymise',
    permission: 'enquiry.delete',
    methods: ['POST'],
  },
  {
    file: 'traffic.astro',
    path: '/admin/traffic',
    permission: 'enquiry.view',
    methods: ['GET'],
  },
  {
    file: 'newsletter.astro',
    path: '/admin/newsletter',
    permission: 'enquiry.delete',
    methods: ['GET'],
  },
  {
    file: 'newsletter/[id]/remove.ts',
    path: '/admin/newsletter/[id]/remove',
    permission: 'enquiry.delete',
    methods: ['POST'],
  },
  {
    file: 'users/index.astro',
    path: '/admin/users',
    permission: 'user.manage',
    methods: ['GET'],
  },
  {
    file: 'users/new.astro',
    path: '/admin/users/new',
    permission: 'user.manage',
    methods: ['GET', 'POST'],
  },
  {
    file: 'users/[id].astro',
    path: '/admin/users/[id]',
    permission: 'user.manage',
    methods: ['GET'],
  },
  {
    file: 'users/[id]/reset.astro',
    path: '/admin/users/[id]/reset',
    permission: 'user.manage',
    methods: ['POST'],
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
  {
    file: 'products.astro',
    path: '/admin/products',
    permission: 'product.edit',
    methods: ['GET'],
  },
  {
    file: 'products/new.astro',
    path: '/admin/products/new',
    permission: 'product.edit',
    methods: ['GET', 'POST'],
  },
  {
    file: 'products/[id].astro',
    path: '/admin/products/[id]',
    permission: 'product.edit',
    methods: ['GET', 'POST'],
  },
  {
    file: 'products/[id]/images.ts',
    path: '/admin/products/[id]/images',
    permission: 'product.edit',
    methods: ['POST'],
  },
  {
    file: 'products/[id]/images/actions.ts',
    path: '/admin/products/[id]/images/actions',
    permission: 'product.edit',
    methods: ['POST'],
  },
  {
    file: 'products/[id]/publish.ts',
    path: '/admin/products/[id]/publish',
    permission: 'product.publish',
    methods: ['POST'],
  },
  {
    file: 'tailors.astro',
    path: '/admin/tailors',
    permission: 'tailor.edit',
    methods: ['GET'],
  },
  {
    file: 'tailors/new.astro',
    path: '/admin/tailors/new',
    permission: 'tailor.edit',
    methods: ['GET', 'POST'],
  },
  {
    file: 'tailors/[id].astro',
    path: '/admin/tailors/[id]',
    permission: 'tailor.edit',
    methods: ['GET'],
  },
  {
    file: 'tailors/[id]/actions.ts',
    path: '/admin/tailors/[id]/actions',
    permission: 'tailor.edit',
    methods: ['POST'],
  },
  {
    file: 'tailors/[id]/publish.ts',
    path: '/admin/tailors/[id]/publish',
    permission: 'tailor.publish',
    methods: ['POST'],
  },
  {
    file: 'tailors/[id]/fees.ts',
    path: '/admin/tailors/[id]/fees',
    permission: 'fee.view',
    methods: ['POST'],
  },
  {
    file: 'tailors/[id]/images.ts',
    path: '/admin/tailors/[id]/images',
    permission: 'tailor.edit',
    methods: ['POST'],
  },
  {
    file: 'tailors/[id]/images/actions.ts',
    path: '/admin/tailors/[id]/images/actions',
    permission: 'tailor.edit',
    methods: ['POST'],
  },
  {
    file: 'enquiries.astro',
    path: '/admin/enquiries',
    permission: 'enquiry.view',
    methods: ['GET'],
  },
  {
    file: 'enquiries/[id].astro',
    path: '/admin/enquiries/[id]',
    permission: 'enquiry.view',
    methods: ['GET'],
  },
  {
    file: 'enquiries/[id]/anonymise.ts',
    path: '/admin/enquiries/[id]/anonymise',
    permission: 'enquiry.delete',
    methods: ['POST'],
  },
  {
    file: 'enquiries/[id]/referrals.ts',
    path: '/admin/enquiries/[id]/referrals',
    permission: 'referral.edit',
    methods: ['POST'],
  },
  {
    file: 'enquiries/[id]/referrals/[rid].ts',
    path: '/admin/enquiries/[id]/referrals/[rid]',
    permission: 'referral.edit',
    methods: ['POST'],
  },
  {
    file: 'enquiries/[id]/referrals/[rid]/fee.ts',
    path: '/admin/enquiries/[id]/referrals/[rid]/fee',
    permission: 'fee.view',
    methods: ['POST'],
  },
  {
    file: 'enquiries/[id]/actions.ts',
    path: '/admin/enquiries/[id]/actions',
    permission: 'enquiry.update',
    methods: ['POST'],
  },
  {
    file: 'media/[...key].ts',
    path: '/admin/media/[...key]',
    permission: 'tailor.edit',
    methods: ['GET'],
  },
];

/** Fills the dynamic segments of a route template ([id], [...key]) so tests can request it. */
export function concretePath(
  path: string,
  params: { id?: number | string; rid?: number | string; key?: string },
): string {
  return path
    .replace('[id]', String(params.id ?? ''))
    .replace('[rid]', String(params.rid ?? 1))
    .replace('[...key]', params.key ?? '');
}
