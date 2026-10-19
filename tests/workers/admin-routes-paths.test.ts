import { describe, expect, it } from 'vitest';
import { concretePath } from '../../src/modules/auth/admin-routes';

describe('concretePath', () => {
  it('fills in [id] and [...key] and leaves plain paths alone', () => {
    expect(concretePath('/admin/tailors/[id]/publish', { id: 7 })).toBe(
      '/admin/tailors/7/publish',
    );
    expect(
      concretePath('/admin/media/[...key]', { key: 'tailor/7/abc/thumb.jpg' }),
    ).toBe('/admin/media/tailor/7/abc/thumb.jpg');
    expect(concretePath('/admin/users', { id: 1 })).toBe('/admin/users');
  });
});
