import { en } from '../../i18n/en';
import { can, type Permission } from '../auth/permissions';

export type NavKey =
  | 'dashboard'
  | 'enquiries'
  | 'tailors'
  | 'categories'
  | 'areas'
  | 'users'
  | 'account';
export type NavLink = {
  key: NavKey;
  href: string;
  label: string;
  permission: Permission;
};

// Order is the order in the header bar. A link appears only for a role that holds its permission (the server checks again on every request).
const ALL: NavLink[] = [
  {
    key: 'dashboard',
    href: '/admin',
    label: en.adminNavDashboard,
    permission: 'dashboard.view',
  },
  {
    key: 'enquiries',
    href: '/admin/enquiries',
    label: en.adminNavEnquiries,
    permission: 'enquiry.view',
  },
  {
    key: 'tailors',
    href: '/admin/tailors',
    label: en.adminNavTailors,
    permission: 'tailor.edit',
  },
  {
    key: 'categories',
    href: '/admin/categories',
    label: en.adminNavCategories,
    permission: 'tailor.edit',
  },
  {
    key: 'areas',
    href: '/admin/areas',
    label: en.adminNavAreas,
    permission: 'tailor.edit',
  },
  {
    key: 'users',
    href: '/admin/users',
    label: en.adminNavUsers,
    permission: 'user.manage',
  },
  {
    key: 'account',
    href: '/admin/account',
    label: en.adminNavAccount,
    permission: 'dashboard.view',
  },
];

export const navLinks = (role: string): NavLink[] =>
  ALL.filter((link) => can(role, link.permission));

/** Which link is the current page: the page itself and everything beneath it (`/admin/tailors/7` is "tailors"). */
export function currentKey(pathname: string): NavKey | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin') return 'dashboard';
  for (const link of ALL.slice(1))
    if (path === link.href || path.startsWith(`${link.href}/`)) return link.key;
  return null;
}
