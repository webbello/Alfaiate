import { en } from '../../i18n/en';
import { can, type Permission } from '../auth/permissions';

export type NavKey =
  | 'dashboard'
  | 'enquiries'
  | 'tailors'
  | 'categories'
  | 'areas'
  | 'products'
  | 'orders'
  | 'interest'
  | 'traffic'
  | 'newsletter'
  | 'users'
  | 'account';
export type NavLink = {
  key: NavKey;
  href: string;
  label: string;
  permission: Permission;
  group: string;
};

// Order is the order in the sidebar; links sharing a group sit together under its heading. A link appears only for a role that holds its permission (the server checks again on every request).
const ALL: NavLink[] = [
  {
    key: 'dashboard',
    href: '/admin',
    label: en.adminNavDashboard,
    permission: 'dashboard.view',
    group: 'Overview',
  },
  {
    key: 'enquiries',
    href: '/admin/enquiries',
    label: en.adminNavEnquiries,
    permission: 'enquiry.view',
    group: 'Overview',
  },
  {
    key: 'orders',
    href: '/admin/orders',
    label: en.adminNavOrders,
    permission: 'enquiry.view',
    group: 'Overview',
  },
  {
    key: 'tailors',
    href: '/admin/tailors',
    label: en.adminNavTailors,
    permission: 'tailor.edit',
    group: 'Catalogue',
  },
  {
    key: 'categories',
    href: '/admin/categories',
    label: en.adminNavCategories,
    permission: 'tailor.edit',
    group: 'Catalogue',
  },
  {
    key: 'areas',
    href: '/admin/areas',
    label: en.adminNavAreas,
    permission: 'tailor.edit',
    group: 'Catalogue',
  },
  {
    key: 'products',
    href: '/admin/products',
    label: en.adminNavProducts,
    permission: 'product.edit',
    group: 'Catalogue',
  },
  {
    key: 'interest',
    href: '/admin/interest',
    label: en.adminNavInterest,
    permission: 'enquiry.view',
    group: 'Site',
  },
  {
    key: 'traffic',
    href: '/admin/traffic',
    label: en.adminNavTraffic,
    permission: 'enquiry.view',
    group: 'Site',
  },
  {
    key: 'newsletter',
    href: '/admin/newsletter',
    label: en.adminNavNewsletter,
    permission: 'enquiry.delete',
    group: 'Site',
  },
  {
    key: 'users',
    href: '/admin/users',
    label: en.adminNavUsers,
    permission: 'user.manage',
    group: 'Settings',
  },
  {
    key: 'account',
    href: '/admin/account',
    label: en.adminNavAccount,
    permission: 'dashboard.view',
    group: 'Settings',
  },
];

export const navLinks = (role: string): NavLink[] =>
  ALL.filter((link) => can(role, link.permission));

/** The phone's bottom bar (FR-ADM-15): the three lists used most, with short labels, only those the role may open. The fourth button, More, opens the full menu. */
const TAB_KEYS: readonly { key: NavKey; label: string }[] = [
  { key: 'enquiries', label: 'Enquiries' },
  { key: 'orders', label: 'Orders' },
  { key: 'tailors', label: 'Tailors' },
];
export const tabLinks = (role: string) =>
  TAB_KEYS.flatMap(({ key, label }) => {
    const link = navLinks(role).find((l) => l.key === key);
    return link ? [{ key, href: link.href, label }] : [];
  });

/** Which link is the current page: the page itself and everything beneath it (`/admin/tailors/7` is "tailors"). */
export function currentKey(pathname: string): NavKey | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin') return 'dashboard';
  for (const link of ALL.slice(1))
    if (path === link.href || path.startsWith(`${link.href}/`)) return link.key;
  return null;
}
