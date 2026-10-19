import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  createEntry,
  listEntries,
  renameEntry,
  setActive,
  setOrder,
  type Kind,
} from '../../src/modules/catalog';

const db = env.DB;
let n = 0;
const actor = async () =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(`c${++n}@example.test`, 'h', 'editor')
      .run()
  ).meta.last_row_id;
const names = async (kind: Kind, opts = {}) =>
  (await listEntries(db, kind, opts)).map((e) => e.name);

for (const kind of ['category', 'area'] as const) {
  describe(`catalog: ${kind}`, () => {
    it('creates an entry with a slug from its name, active, at the end of the order', async () => {
      const by = await actor();
      const a = await createEntry(db, by, kind, {
        name: `First ${kind} Ñandú`,
      });
      const b = await createEntry(db, by, kind, { name: `Second ${kind}` });
      expect(a.ok && b.ok).toBe(true);
      const rows = await listEntries(db, kind);
      const first = rows.find((r) => r.name.startsWith('First'))!;
      expect(first.slug).toBe(`first-${kind}-nandu`);
      expect(first.is_active).toBe(1);
      expect(rows.findIndex((r) => r.name.startsWith('First'))).toBeLessThan(
        rows.findIndex((r) => r.name.startsWith('Second')),
      );
    });

    it('gives a repeated name a different slug instead of failing', async () => {
      const by = await actor();
      await createEntry(db, by, kind, { name: 'Same Name' });
      await createEntry(db, by, kind, { name: 'Same Name' });
      const slugs = (await listEntries(db, kind))
        .filter((r) => r.name === 'Same Name')
        .map((r) => r.slug);
      expect(new Set(slugs).size).toBe(2);
    });

    it('rejects an empty or very long name', async () => {
      const by = await actor();
      expect(await createEntry(db, by, kind, { name: '   ' })).toEqual({
        ok: false,
        error: 'invalid',
      });
      expect(await createEntry(db, by, kind, { name: 'x'.repeat(81) })).toEqual(
        { ok: false, error: 'invalid' },
      );
    });

    it('renames without changing the slug, so links and URLs stay stable', async () => {
      const by = await actor();
      const created = await createEntry(db, by, kind, { name: 'Old Name' });
      if (!created.ok) throw new Error('create failed');
      const before = (await listEntries(db, kind)).find(
        (r) => r.id === created.id,
      )!;
      expect(
        await renameEntry(db, by, kind, created.id, { name: 'New Name' }),
      ).toEqual({ ok: true });
      const after = (await listEntries(db, kind)).find(
        (r) => r.id === created.id,
      )!;
      expect(after.name).toBe('New Name');
      expect(after.slug).toBe(before.slug);
    });

    it('reorders by sort order', async () => {
      const by = await actor();
      const a = await createEntry(db, by, kind, { name: 'Order A' });
      const b = await createEntry(db, by, kind, { name: 'Order B' });
      if (!a.ok || !b.ok) throw new Error('create failed');
      await setOrder(db, by, kind, b.id, -50);
      await setOrder(db, by, kind, a.id, -40);
      const ordered = (await names(kind)).filter((x) => x.startsWith('Order '));
      expect(ordered).toEqual(['Order B', 'Order A']);
    });

    it('deactivates and reactivates; inactive entries are left out of choices but still listed for admins', async () => {
      const by = await actor();
      const created = await createEntry(db, by, kind, {
        name: 'Soon Inactive',
      });
      if (!created.ok) throw new Error('create failed');
      await setActive(db, by, kind, created.id, false);
      expect(await names(kind, { onlyActive: true })).not.toContain(
        'Soon Inactive',
      );
      expect(await names(kind)).toContain('Soon Inactive');
      await setActive(db, by, kind, created.id, true);
      expect(await names(kind, { onlyActive: true })).toContain(
        'Soon Inactive',
      );
    });

    it('reports an unknown id', async () => {
      const by = await actor();
      expect(await renameEntry(db, by, kind, 99999, { name: 'x' })).toEqual({
        ok: false,
        error: 'not_found',
      });
      expect(await setActive(db, by, kind, 99999, false)).toEqual({
        ok: false,
        error: 'not_found',
      });
      expect(await setOrder(db, by, kind, 99999, 1)).toEqual({
        ok: false,
        error: 'not_found',
      });
    });

    it('audits changes by id only', async () => {
      const by = await actor();
      const created = await createEntry(db, by, kind, {
        name: 'Audited Secret Name',
      });
      if (!created.ok) throw new Error('create failed');
      const rows = await db
        .prepare(
          "SELECT * FROM audit_log WHERE action = 'catalog_changed' AND admin_user_id = ?",
        )
        .bind(by)
        .all();
      expect(rows.results.length).toBeGreaterThan(0);
      expect(JSON.stringify(rows.results)).not.toContain('Audited Secret Name');
    });
  });
}

describe('catalog: deactivation keeps existing links', () => {
  it('a category stays attached to a tailor after it is deactivated', async () => {
    const by = await actor();
    const created = await createEntry(db, by, 'category', {
      name: 'Linked Then Off',
    });
    if (!created.ok) throw new Error('create failed');
    const tailor = (
      await db
        .prepare(
          "INSERT INTO tailor (slug, display_name) VALUES ('catalog-link', 'Fake')",
        )
        .run()
    ).meta.last_row_id;
    await db
      .prepare(
        'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
      )
      .bind(tailor, created.id)
      .run();
    await setActive(db, by, 'category', created.id, false);
    expect(
      await db
        .prepare('SELECT 1 FROM tailor_category WHERE tailor_id = ?')
        .bind(tailor)
        .first(),
    ).not.toBeNull();
  });
});

describe('catalog: kind is a whitelist', () => {
  it('refuses an unknown kind instead of building SQL from it', async () => {
    await expect(
      listEntries(db, 'tailor; DROP TABLE admin_user' as never),
    ).rejects.toThrow();
  });
});
