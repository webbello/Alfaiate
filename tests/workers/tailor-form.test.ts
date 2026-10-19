import { describe, expect, it } from 'vitest';
import {
  areasFromForm,
  categoriesFromForm,
  profileFromForm,
} from '../../src/modules/tailors/form';

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe('profileFromForm', () => {
  it('reads the profile fields and ignores everything else (no mass assignment)', () => {
    const input = profileFromForm(
      form({
        display_name: 'Ana',
        description: 'Suits',
        whatsapp: '7712 3456',
        status: 'approved',
        is_published: '1',
        fee_terms_text: 'x',
        verified_fields: '["a"]',
      }),
    );
    expect(input).toMatchObject({
      display_name: 'Ana',
      description: 'Suits',
      whatsapp: '7712 3456',
    });
    for (const key of [
      'status',
      'is_published',
      'fee_terms_text',
      'verified_fields',
    ])
      expect(input).not.toHaveProperty(key);
  });

  it('leaves out the slug when it was not submitted, and passes blanks through so a field can be cleared', () => {
    const input = profileFromForm(
      form({ display_name: 'Ana', description: '' }),
    );
    expect(input).not.toHaveProperty('slug');
    expect(input.description).toBe('');
  });
});

describe('categoriesFromForm', () => {
  it('returns only ticked categories with their price fields', () => {
    const entries = categoriesFromForm(
      form({
        cat_1: 'on',
        from_1: '20',
        to_1: '35',
        unit_1: 'each',
        confirmed_1: '2026-01-01',
        from_2: '99',
        cat_3: 'on',
      }),
      [1, 2, 3],
    );
    expect(entries).toEqual([
      {
        category_id: 1,
        price_from: '20',
        price_to: '35',
        price_unit_note: 'each',
        price_confirmed_on: '2026-01-01',
        price_source: undefined,
      },
      {
        category_id: 3,
        price_from: '',
        price_to: '',
        price_unit_note: '',
        price_confirmed_on: '',
        price_source: undefined,
      },
    ]);
  });

  it('accepts a price source only from the two known values', () => {
    expect(
      categoriesFromForm(form({ cat_1: 'on', source_1: 'verified' }), [1])[0]
        .price_source,
    ).toBe('verified');
    expect(
      categoriesFromForm(form({ cat_1: 'on', source_1: 'hacked' }), [1])[0]
        .price_source,
    ).toBeUndefined();
  });

  it('ignores ticked ids that are not on the page', () => {
    expect(categoriesFromForm(form({ cat_9: 'on' }), [1, 2])).toEqual([]);
  });
});

describe('areasFromForm', () => {
  it('returns shop and served links separately', () => {
    expect(
      areasFromForm(
        form({ shop_4: 'on', serves_4: 'on', serves_5: 'on' }),
        [4, 5, 6],
      ),
    ).toEqual([
      { area_id: 4, kind: 'shop_location' },
      { area_id: 4, kind: 'serves' },
      { area_id: 5, kind: 'serves' },
    ]);
  });
});
