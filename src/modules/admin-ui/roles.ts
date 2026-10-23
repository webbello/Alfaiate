import type { Permission, Role } from '../auth/permissions';

export const ROLE_INFO: Record<Role, { label: string; summary: string }> = {
  owner: {
    label: 'Owner',
    summary:
      'Runs everything: users, fees and removing personal details, plus all of the manager tasks.',
  },
  manager: {
    label: 'Manager',
    summary:
      'Runs the day-to-day work: tailors and publishing, enquiries, referrals and join requests. No fees, no users.',
  },
  editor: {
    label: 'Editor',
    summary:
      'Edits tailor profiles, work types, areas and photos. Cannot publish and cannot see enquiries.',
  },
  viewer: {
    label: 'Viewer',
    summary: 'Can look at the dashboard only.',
  },
};

/** The abilities, in plain words, in the order the roles table lists them. */
export const ABILITIES: { permission: Permission; label: string }[] = [
  { permission: 'dashboard.view', label: 'See the dashboard' },
  {
    permission: 'tailor.edit',
    label: 'Edit tailors, work types, areas and photos',
  },
  {
    permission: 'tailor.publish',
    label: 'Approve and publish tailors, approve join requests',
  },
  { permission: 'enquiry.view', label: 'Read enquiries and join requests' },
  { permission: 'enquiry.update', label: 'Change enquiry status, add notes' },
  { permission: 'referral.edit', label: 'Record referrals and their outcome' },
  { permission: 'fee.view', label: 'See and edit fees' },
  { permission: 'enquiry.delete', label: 'Remove personal details' },
  { permission: 'user.manage', label: 'Manage users' },
];

/** "Today", "3 days ago", or the date: for "last signed in". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Never';
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return iso.slice(0, 10);
}
