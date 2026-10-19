import { describe, expect, it } from 'vitest';
import {
  directoryQuery,
  parseDirectoryFilters,
} from '../../src/modules/directory/filters';

describe('directory search box (Phase 7d)', () => {
  it('reads q trimmed and capped, ignores an empty one, and keeps it in links', () => {
    expect(parseDirectoryFilters(new URLSearchParams('q=%20Ana%20')).q).toBe(
      'Ana',
    );
    expect(parseDirectoryFilters(new URLSearchParams('q=')).q).toBeUndefined();
    expect(
      parseDirectoryFilters(new URLSearchParams(`q=${'a'.repeat(100)}`)).q,
    ).toHaveLength(60);
    expect(
      directoryQuery({
        category: undefined,
        area: undefined,
        homeVisit: false,
        q: 'Ana & Co',
      }),
    ).toBe('?q=Ana%20%26%20Co');
  });
});
