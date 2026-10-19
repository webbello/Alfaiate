import { describe, expect, it } from 'vitest';
import { currentKey, navLinks } from '../../src/modules/admin-ui/nav';
import { ROLES, can } from '../../src/modules/auth/permissions';

const keys = (role: string) => navLinks(role).map((l) => l.key);

describe('navLinks (the header bar of every admin page)', () => {
  it('shows each role exactly the pages it may open', () => {
    expect(keys('owner')).toEqual([
      'dashboard',
      'enquiries',
      'tailors',
      'categories',
      'areas',
      'interest',
      'users',
      'account',
    ]);
    expect(keys('manager')).toEqual([
      'dashboard',
      'enquiries',
      'tailors',
      'categories',
      'areas',
      'interest',
      'account',
    ]);
    expect(keys('editor')).toEqual([
      'dashboard',
      'tailors',
      'categories',
      'areas',
      'account',
    ]);
    expect(keys('viewer')).toEqual(['dashboard', 'account']);
  });

  it('never offers a link the role has no permission for, and none for an unknown role', () => {
    for (const role of [...ROLES, 'ghost'])
      for (const link of navLinks(role))
        expect(can(role, link.permission), `${role} ${link.key}`).toBe(true);
    expect(navLinks('ghost')).toEqual([]);
  });

  it('points at real admin addresses with readable labels', () => {
    for (const link of navLinks('owner')) {
      expect(link.href).toMatch(/^\/admin(\/[a-z]+)?$/);
      expect(link.label.length).toBeGreaterThan(2);
    }
  });
});

describe('currentKey (which link is the current page)', () => {
  it('matches the page and everything beneath it', () => {
    expect(currentKey('/admin')).toBe('dashboard');
    expect(currentKey('/admin/')).toBe('dashboard');
    expect(currentKey('/admin/enquiries')).toBe('enquiries');
    expect(currentKey('/admin/enquiries/12')).toBe('enquiries');
    expect(currentKey('/admin/tailors/new')).toBe('tailors');
    expect(currentKey('/admin/tailors/7')).toBe('tailors');
    expect(currentKey('/admin/categories')).toBe('categories');
    expect(currentKey('/admin/areas')).toBe('areas');
    expect(currentKey('/admin/interest')).toBe('interest');
    expect(currentKey('/admin/users')).toBe('users');
    expect(currentKey('/admin/account')).toBe('account');
  });

  it('is empty for anything else, including look-alikes', () => {
    for (const path of [
      '/',
      '/admin/login',
      '/admin/unknown',
      '/administrator',
      '/admin/enquiriesx',
      '/tailors',
    ])
      expect(currentKey(path), path).toBeNull();
  });
});
