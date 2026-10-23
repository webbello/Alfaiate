import { describe, expect, it } from 'vitest';

// Product photos need product.edit and tailor photos need tailor.edit. No role holds one without the other, so a role test cannot tell the
// two apart; this pins the choice in the route itself.
const sources = import.meta.glob('../../src/pages/admin/media/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('admin photo preview route', () => {
  it('asks for product.edit for a product key and tailor.edit for everything else', () => {
    const source = Object.values(sources)[0]!;
    expect(source).toMatch(
      /parseProductKey\(key\)\s*\?\s*'product\.edit'\s*:\s*'tailor\.edit'/,
    );
    expect(source.indexOf('requirePermission(')).toBeLessThan(
      source.indexOf('MEDIA_PRIVATE'),
    );
  });
});
