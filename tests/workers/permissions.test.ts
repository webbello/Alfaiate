import { describe, expect, it } from 'vitest';
import { can, PERMISSIONS, ROLES } from '../../src/modules/auth/permissions';

// The expected table is written out in full on purpose: it mirrors ARCHITECTURE §6.
const expected = {
  owner: [
    'dashboard.view',
    'tailor.edit',
    'tailor.publish',
    'enquiry.view',
    'enquiry.update',
    'referral.edit',
    'fee.view',
    'enquiry.delete',
    'user.manage',
    'product.edit',
    'product.publish',
  ],
  manager: [
    'dashboard.view',
    'tailor.edit',
    'tailor.publish',
    'enquiry.view',
    'enquiry.update',
    'referral.edit',
    'product.edit',
    'product.publish',
  ],
  editor: ['dashboard.view', 'tailor.edit', 'product.edit'],
  viewer: ['dashboard.view'],
} as const;

describe('can(role, permission)', () => {
  for (const role of ROLES) {
    for (const permission of PERMISSIONS) {
      const allowed = (expected[role] as readonly string[]).includes(
        permission,
      );
      it(`${role} ${allowed ? 'may' : 'may not'} ${permission}`, () => {
        expect(can(role, permission)).toBe(allowed);
      });
    }
  }

  it('denies an unknown role', () => {
    expect(can('superuser', 'dashboard.view')).toBe(false);
    expect(can('', 'dashboard.view')).toBe(false);
  });

  it('denies an unmapped permission, even for the owner (deny by default)', () => {
    expect(can('owner', 'tailor.nuke')).toBe(false);
  });

  it('keeps customer data away from editor and viewer (BR-07, SEC-05)', () => {
    for (const role of ['editor', 'viewer']) {
      expect(can(role, 'enquiry.view')).toBe(false);
      expect(can(role, 'referral.edit')).toBe(false);
      expect(can(role, 'fee.view')).toBe(false);
    }
  });
});
