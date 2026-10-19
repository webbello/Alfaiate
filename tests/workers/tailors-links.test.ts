import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  centsToDollars,
  dollarsToCents,
  getTailorAreas,
  getTailorCategories,
  setAreas,
  setCategories,
} from '../../src/modules/tailors/links';
import { createEntry, setActive } from '../../src/modules/catalog';
import { createDraft } from '../../src/modules/tailors/repo';

const db = env.DB;
let n = 0;
const actor = async () =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(`l${++n}@example.test`, 'h', 'manager')
      .run()
  ).meta.last_row_id;
const tailor = async () => {
  const by = await actor();
  const created = await createDraft(db, by, { display_name: `Links ${++n}` });
  if (!created.ok) throw new Error('create failed');
  return { by, id: created.id };
};
const category = async (by: number, active = true) => {
  const c = await createEntry(db, by, 'category', { name: `Cat ${++n}` });
  if (!c.ok) throw new Error('category failed');
  if (!active) await setActive(db, by, 'category', c.id, false);
  return c.id;
};
const area = async (by: number, active = true) => {
  const a = await createEntry(db, by, 'area', { name: `Area ${++n}` });
  if (!a.ok) throw new Error('area failed');
  if (!active) await setActive(db, by, 'area', a.id, false);
  return a.id;
};
const publishRaw = (id: number) =>
  db
    .prepare(
      "UPDATE tailor SET status = 'approved', permission_recorded = 1, is_published = 1 WHERE id = ?",
    )
    .bind(id)
    .run();

describe('money', () => {
  it('turns dollars into cents without floating-point surprises', () => {
    expect(dollarsToCents('25')).toBe(2500);
    expect(dollarsToCents('25.5')).toBe(2550);
    expect(dollarsToCents('0.07')).toBe(7);
    expect(dollarsToCents('19.99')).toBe(1999);
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('  ')).toBeNull();
  });
  it('rejects anything that is not a plain amount', () => {
    for (const bad of [
      '-5',
      '1e3',
      '12.345',
      'abc',
      '$25',
      '25,50',
      '1000000000',
    ])
      expect(() => dollarsToCents(bad), bad).toThrow();
  });
  it('shows cents as dollars for the form', () => {
    expect(centsToDollars(2500)).toBe('25');
    expect(centsToDollars(2550)).toBe('25.50');
    expect(centsToDollars(null)).toBe('');
  });
});

describe('setCategories', () => {
  it('stores prices in cents, replaces the previous set and defaults the source to tailor_supplied (BR-11)', async () => {
    const { by, id } = await tailor();
    const [a, b] = [await category(by), await category(by)];
    expect(
      await setCategories(db, by, 'editor', id, [
        {
          category_id: a,
          price_from: '20',
          price_to: '35.50',
          price_unit_note: 'per shirt',
        },
        { category_id: b },
      ]),
    ).toEqual({ ok: true });
    let rows = await getTailorCategories(db, id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.category_id === a)).toMatchObject({
      price_from: 2000,
      price_to: 3550,
      price_unit_note: 'per shirt',
      price_source: 'tailor_supplied',
    });
    expect(
      await setCategories(db, by, 'editor', id, [{ category_id: b }]),
    ).toEqual({ ok: true });
    rows = await getTailorCategories(db, id);
    expect(rows.map((r) => r.category_id)).toEqual([b]);
  });

  it('refuses an inverted price range, a bad amount and a bad confirmation date', async () => {
    const { by, id } = await tailor();
    const c = await category(by);
    expect(
      (
        await setCategories(db, by, 'editor', id, [
          { category_id: c, price_from: '50', price_to: '10' },
        ])
      ).ok,
    ).toBe(false);
    expect(
      (
        await setCategories(db, by, 'editor', id, [
          { category_id: c, price_from: 'free' },
        ])
      ).ok,
    ).toBe(false);
    expect(
      (
        await setCategories(db, by, 'editor', id, [
          { category_id: c, price_confirmed_on: '2026-02-30' },
        ])
      ).ok,
    ).toBe(false);
    expect(await getTailorCategories(db, id)).toHaveLength(0);
  });

  it('lets only a manager or owner mark a price verified (BR-11)', async () => {
    const { by, id } = await tailor();
    const c = await category(by);
    expect(
      await setCategories(db, by, 'editor', id, [
        { category_id: c, price_from: '10', price_source: 'verified' },
      ]),
    ).toEqual({ ok: false, error: 'forbidden_source' });
    expect(
      await setCategories(db, by, 'manager', id, [
        { category_id: c, price_from: '10', price_source: 'verified' },
      ]),
    ).toEqual({ ok: true });
    expect((await getTailorCategories(db, id))[0].price_source).toBe(
      'verified',
    );
  });

  it('drops the verified mark when an editor changes a verified price', async () => {
    const { by, id } = await tailor();
    const c = await category(by);
    await setCategories(db, by, 'manager', id, [
      { category_id: c, price_from: '10', price_source: 'verified' },
    ]);
    await setCategories(db, by, 'editor', id, [
      { category_id: c, price_from: '12' },
    ]);
    expect((await getTailorCategories(db, id))[0]).toMatchObject({
      price_from: 1200,
      price_source: 'tailor_supplied',
    });
  });

  it('keeps a verified mark when an editor saves the page without changing that price', async () => {
    const { by, id } = await tailor();
    const c = await category(by);
    await setCategories(db, by, 'manager', id, [
      { category_id: c, price_from: '10', price_source: 'verified' },
    ]);
    await setCategories(db, by, 'editor', id, [
      { category_id: c, price_from: '10', price_source: 'verified' },
    ]);
    expect((await getTailorCategories(db, id))[0].price_source).toBe(
      'verified',
    );
  });

  it('refuses a new link to a deactivated category but keeps one that already exists', async () => {
    const { by, id } = await tailor();
    const c = await category(by);
    await setCategories(db, by, 'editor', id, [{ category_id: c }]);
    await setActive(db, by, 'category', c, false);
    expect(
      await setCategories(db, by, 'editor', id, [
        { category_id: c, price_from: '5' },
      ]),
    ).toEqual({ ok: true });
    const off = await category(by, false);
    expect(
      await setCategories(db, by, 'editor', id, [
        { category_id: c },
        { category_id: off },
      ]),
    ).toEqual({ ok: false, error: 'inactive' });
  });

  it('refuses an unknown category and a duplicate entry', async () => {
    const { by, id } = await tailor();
    const c = await category(by);
    expect(
      await setCategories(db, by, 'editor', id, [{ category_id: 99999 }]),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await setCategories(db, by, 'editor', id, [
        { category_id: c },
        { category_id: c },
      ]),
    ).toEqual({ ok: false, error: 'invalid' });
  });

  it('applies the edit lock: an editor cannot change a published tailor, a manager can', async () => {
    const { by, id } = await tailor();
    const c = await category(by);
    await publishRaw(id);
    expect(
      await setCategories(db, by, 'editor', id, [{ category_id: c }]),
    ).toEqual({ ok: false, error: 'locked' });
    expect(
      await setCategories(db, by, 'manager', id, [{ category_id: c }]),
    ).toEqual({ ok: true });
    expect(await setCategories(db, by, 'manager', 99999, [])).toEqual({
      ok: false,
      error: 'not_found',
    });
  });
});

describe('setAreas', () => {
  it('stores shop locations and served areas and replaces the set', async () => {
    const { by, id } = await tailor();
    const [a, b] = [await area(by), await area(by)];
    expect(
      await setAreas(db, by, 'editor', id, [
        { area_id: a, kind: 'shop_location' },
        { area_id: a, kind: 'serves' },
        { area_id: b, kind: 'serves' },
      ]),
    ).toEqual({ ok: true });
    expect(await getTailorAreas(db, id)).toHaveLength(3);
    await setAreas(db, by, 'editor', id, [{ area_id: b, kind: 'serves' }]);
    expect((await getTailorAreas(db, id)).map((r) => r.area_id)).toEqual([b]);
  });

  it('refuses an unknown kind, an unknown area, a duplicate and a new link to a deactivated area', async () => {
    const { by, id } = await tailor();
    const a = await area(by);
    const off = await area(by, false);
    expect(
      (
        await setAreas(db, by, 'editor', id, [
          { area_id: a, kind: 'lives' as never },
        ])
      ).ok,
    ).toBe(false);
    expect(
      (
        await setAreas(db, by, 'editor', id, [
          { area_id: 99999, kind: 'serves' },
        ])
      ).ok,
    ).toBe(false);
    expect(
      (
        await setAreas(db, by, 'editor', id, [
          { area_id: a, kind: 'serves' },
          { area_id: a, kind: 'serves' },
        ])
      ).ok,
    ).toBe(false);
    expect(
      await setAreas(db, by, 'editor', id, [{ area_id: off, kind: 'serves' }]),
    ).toEqual({ ok: false, error: 'inactive' });
  });

  it('applies the edit lock', async () => {
    const { by, id } = await tailor();
    const a = await area(by);
    await publishRaw(id);
    expect(
      await setAreas(db, by, 'editor', id, [{ area_id: a, kind: 'serves' }]),
    ).toEqual({ ok: false, error: 'locked' });
  });
});
