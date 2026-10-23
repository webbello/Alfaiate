export const ROLES = ['owner', 'manager', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'dashboard.view',
  'tailor.edit',
  'tailor.publish',
  'enquiry.view',
  'enquiry.update',
  'referral.edit',
  'fee.view',
  'enquiry.delete',
  'user.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Role bundles from ARCHITECTURE §6 (confirmed by the owner, OQ-15). Fixed in code; no custom roles.
const MANAGER: readonly Permission[] = [
  'dashboard.view',
  'tailor.edit',
  'tailor.publish',
  'enquiry.view',
  'enquiry.update',
  'referral.edit',
];
const GRANTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: MANAGER,
  editor: ['dashboard.view', 'tailor.edit'],
  viewer: ['dashboard.view'],
};

/** What a role may do, for the read-only roles table. Same data `can` uses. */
export const grantsFor = (role: Role): readonly Permission[] => GRANTS[role];

/** Deny by default: unknown roles and unmapped permissions are refused. */
export function can(role: string, permission: string): boolean {
  const grants = (GRANTS as Record<string, readonly string[] | undefined>)[
    role
  ];
  return grants?.includes(permission) ?? false;
}
