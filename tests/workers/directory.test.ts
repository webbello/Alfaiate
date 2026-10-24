import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import type { DirectoryFilters } from '../../src/modules/directory/filters';
import {
  getActiveCategory,
  getPublishedBySlug,
  listActiveAreas,
  listActiveCategories,
  listPublished,
} from '../../src/modules/directory/queries';

const db = env.DB;
let n = 0;
const none: DirectoryFilters = {
  category: undefined,
  area: undefined,
  homeVisit: false,
};

type T = {
  name?: string;
  published?: boolean;
  consent?: boolean;
  whatsapp?: string | null;
  phone?: string | null;
  homeVisits?: 'yes' | 'no' | 'unknown';
  verified?: string[];
  languages?: string | null;
  description?: string | null;
  address?: string | null;
  status?: string;
};
async function tailor(o: T = {}) {
  const published = o.published ?? true;
  const id = (
    await db
      .prepare(
        `INSERT INTO tailor (slug, display_name, description, shop_address_text, home_visits, languages, whatsapp_e164, phone_e164, status, is_published, permission_recorded, contact_publish_consent, verified_fields)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `d-${++n}`,
        o.name ?? `Tailor ${n}`,
        o.description ?? null,
        o.address ?? null,
        o.homeVisits ?? 'unknown',
        o.languages ?? null,
        o.whatsapp === undefined ? '+67077123456' : o.whatsapp,
        o.phone === undefined ? '+67033123456' : o.phone,
        published ? 'approved' : (o.status ?? 'draft'),
        published ? 1 : 0,
        published ? 1 : 0,
        (o.consent ?? true) ? 1 : 0,
        JSON.stringify(o.verified ?? []),
      )
      .run()
  ).meta.last_row_id;
  return id;
}
const slugOf = async (id: number) =>
  (await db
    .prepare('SELECT slug FROM tailor WHERE id = ?')
    .bind(id)
    .first<{ slug: string }>())!.slug;
const category = async (name: string, active = 1, sort = 0) =>
  (
    await db
      .prepare(
        'INSERT INTO garment_category (slug, name, is_active, sort_order) VALUES (?, ?, ?, ?)',
      )
      .bind(`c-${++n}`, name, active, sort)
      .run()
  ).meta.last_row_id;
const area = async (name: string, active = 1, sort = 0) =>
  (
    await db
      .prepare(
        'INSERT INTO service_area (slug, name, is_active, sort_order) VALUES (?, ?, ?, ?)',
      )
      .bind(`a-${++n}`, name, active, sort)
      .run()
  ).meta.last_row_id;
const link = (
  t: number,
  c: number,
  from: number | null = null,
  to: number | null = null,
  source = 'tailor_supplied',
) =>
  db
    .prepare(
      'INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to, price_source, price_confirmed_on) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(t, c, from, to, source, from ? '2026-09-01' : null)
    .run();
const areaLink = (t: number, a: number, kind = 'serves') =>
  db
    .prepare(
      'INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, ?)',
    )
    .bind(t, a, kind)
    .run();
const slug = (table: string, id: number) =>
  db
    .prepare(`SELECT slug FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<{ slug: string }>()
    .then((r) => r!.slug);
const photo = async (
  t: number,
  o: { permission?: number; visible?: number; alt?: string } = {},
) =>
  (
    await db
      .prepare(
        'INSERT INTO portfolio_image (tailor_id, file_key, alt_text, permission_granted, is_visible) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(
        t,
        (++n).toString(16).padStart(32, '0'),
        o.alt ?? 'A suit',
        o.permission ?? 1,
        o.visible ?? 1,
      )
      .run()
  ).meta.last_row_id;
const names = async (filters = none) =>
  (await listPublished(db, filters)).tailors.map((t) => t.name);

describe('who appears in the directory (BR-05)', () => {
  it('lists only published tailors, never drafts, unpublished or suspended ones', async () => {
    const live = await tailor({ name: 'Visible Fake One' });
    await tailor({ name: 'Hidden Draft Fake', published: false });
    await tailor({
      name: 'Hidden Suspended Fake',
      published: false,
      status: 'suspended',
    });
    const found = await names();
    expect(found).toContain('Visible Fake One');
    expect(found).not.toContain('Hidden Draft Fake');
    expect(found).not.toContain('Hidden Suspended Fake');
    expect(await getPublishedBySlug(db, await slugOf(live))).not.toBeNull();
  });

  it('is sorted alphabetically, ignoring case', async () => {
    await tailor({ name: 'zzz order Fake' });
    await tailor({ name: 'ZZY order Fake' });
    await tailor({ name: 'zzx order Fake' });
    expect((await names()).filter((x) => x.endsWith('order Fake'))).toEqual([
      'zzx order Fake',
      'ZZY order Fake',
      'zzz order Fake',
    ]);
  });

  it('returns null for an unpublished or unknown slug and survives hostile slugs', async () => {
    const draft = await tailor({ published: false });
    expect(await getPublishedBySlug(db, await slugOf(draft))).toBeNull();
    for (const bad of [
      'no-such',
      "x' OR '1'='1",
      '',
      '../../etc/passwd',
      'a'.repeat(500),
    ])
      expect(await getPublishedBySlug(db, bad), bad).toBeNull();
  });

  it('caps the list at 200 and says so', async () => {
    await db.batch(
      Array.from({ length: 205 }, (_, i) =>
        db
          .prepare(
            "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded) VALUES (?, ?, 'approved', 1, 1)",
          )
          .bind(`cap-${i}`, `Cap Fake ${i}`),
      ),
    );
    const result = await listPublished(db, none);
    expect(result.tailors).toHaveLength(200);
    expect(result.truncated).toBe(true);
    await db.prepare("DELETE FROM tailor WHERE slug LIKE 'cap-%'").run();
  });
});

describe('contacts and address need consent (PRV-06, BR-06)', () => {
  it('show phone, WhatsApp and address only when the tailor consented and the value exists', async () => {
    const yes = await getPublishedBySlug(
      db,
      await slugOf(await tailor({ consent: true, address: 'Rua Fake 1' })),
    );
    expect(yes?.contacts.whatsapp).toMatchObject({ value: '+67077123456' });
    expect(yes?.contacts.phone).toMatchObject({ value: '+67033123456' });
    expect(yes?.address?.value).toBe('Rua Fake 1');

    const no = await getPublishedBySlug(
      db,
      await slugOf(await tailor({ consent: false, address: 'Rua Secret 2' })),
    );
    expect(no?.contacts).toEqual({ whatsapp: null, phone: null });
    expect(no?.address).toBeNull();
  });

  it('handles each channel on its own: no WhatsApp number means no WhatsApp contact', async () => {
    const onlyPhone = await getPublishedBySlug(
      db,
      await slugOf(await tailor({ whatsapp: null })),
    );
    expect(onlyPhone?.contacts.whatsapp).toBeNull();
    expect(onlyPhone?.contacts.phone).not.toBeNull();
    const onlyWhatsapp = await getPublishedBySlug(
      db,
      await slugOf(await tailor({ phone: null })),
    );
    expect(onlyWhatsapp?.contacts.phone).toBeNull();
  });
});

describe('verified marks (BR-11, FR-PRO-05)', () => {
  it('mark a fact verified only if it is in the verified list; others are tailor-supplied', async () => {
    const view = await getPublishedBySlug(
      db,
      await slugOf(
        await tailor({
          description: 'We make suits.',
          homeVisits: 'yes',
          verified: ['description'],
        }),
      ),
    );
    expect(view?.description).toEqual({
      value: 'We make suits.',
      verified: true,
    });
    expect(view?.homeVisits).toEqual({ value: 'yes', verified: false });
  });

  it('show languages only when verified', async () => {
    expect(
      (
        await getPublishedBySlug(
          db,
          await slugOf(
            await tailor({ languages: 'Tetum, Portuguese', verified: [] }),
          ),
        )
      )?.languages,
    ).toBeNull();
    expect(
      (
        await getPublishedBySlug(
          db,
          await slugOf(
            await tailor({
              languages: 'Tetum, Portuguese',
              verified: ['languages'],
            }),
          ),
        )
      )?.languages,
    ).toEqual({ value: 'Tetum, Portuguese', verified: true });
  });

  it('never presents "unknown" home visits as an answer', async () => {
    expect(
      (
        await getPublishedBySlug(
          db,
          await slugOf(await tailor({ homeVisits: 'unknown' })),
        )
      )?.homeVisits,
    ).toBeNull();
    expect(
      (
        await getPublishedBySlug(
          db,
          await slugOf(await tailor({ homeVisits: 'no' })),
        )
      )?.homeVisits,
    ).toEqual({ value: 'no', verified: false });
  });

  it('tolerates a damaged verified list by treating nothing as verified', async () => {
    const id = await tailor({ description: 'Words', verified: [] });
    await db
      .prepare("UPDATE tailor SET verified_fields = '{not json' WHERE id = ?")
      .bind(id)
      .run()
      .catch(() => undefined);
    const view = await getPublishedBySlug(db, await slugOf(id));
    expect(view?.description?.verified).toBe(false);
  });
});

describe('categories, areas and prices', () => {
  it('shows only active categories and areas, in the admin-chosen order', async () => {
    const t = await tailor();
    const [b, a, off] = [
      await category('Second cat Fake', 1, 20),
      await category('First cat Fake', 1, 10),
      await category('Off cat Fake', 0, 5),
    ];
    for (const c of [b, a, off]) await link(t, c);
    const [x, y] = [
      await area('Area Y Fake', 1, 2),
      await area('Area X Fake', 1, 1),
    ];
    await areaLink(t, x, 'serves');
    await areaLink(t, y, 'shop_location');
    const view = (await getPublishedBySlug(db, await slugOf(t)))!;
    expect(view.categories.map((c) => c.name)).toEqual([
      'First cat Fake',
      'Second cat Fake',
    ]);
    expect(view.areas.map((r) => r.name)).toEqual([
      'Area X Fake',
      'Area Y Fake',
    ]);
    expect(view.areas.find((r) => r.name === 'Area X Fake')?.kind).toBe(
      'shop_location',
    );
  });

  it('carries prices in cents with their source and date, and a card summary across categories', async () => {
    const t = await tailor();
    const [a, b] = [
      await category('Cheap cat Fake'),
      await category('Dear cat Fake'),
    ];
    await link(t, a, 2000, 3000, 'verified');
    await link(t, b, 5000, 9000);
    const view = (await getPublishedBySlug(db, await slugOf(t)))!;
    expect(
      view.categories.find((c) => c.name === 'Cheap cat Fake'),
    ).toMatchObject({
      priceFrom: 2000,
      priceTo: 3000,
      verified: true,
      confirmedOn: '2026-09-01',
    });
    expect(
      view.categories.find((c) => c.name === 'Dear cat Fake'),
    ).toMatchObject({ verified: false });
    expect(view.priceHint).toEqual({ from: 2000, to: 9000 });
    expect(
      (await getPublishedBySlug(db, await slugOf(await tailor())))?.priceHint,
    ).toBeNull();
  });

  it('lists active categories and areas, optionally only those with a published tailor', async () => {
    const used = await category('Used cat Fake', 1, 1);
    const unused = await category('Unused cat Fake', 1, 2);
    const inactive = await category('Inactive cat Fake', 0, 3);
    await link(await tailor(), used);
    await link(await tailor({ published: false }), unused);
    const all = (await listActiveCategories(db)).map((c) => c.name);
    expect(all).toEqual(
      expect.arrayContaining(['Used cat Fake', 'Unused cat Fake']),
    );
    expect(all).not.toContain('Inactive cat Fake');
    const withTailors = (
      await listActiveCategories(db, { onlyWithTailors: true })
    ).map((c) => c.name);
    expect(withTailors).toContain('Used cat Fake');
    expect(withTailors).not.toContain('Unused cat Fake');
    expect(
      await getActiveCategory(db, await slug('garment_category', used)),
    ).toMatchObject({ name: 'Used cat Fake' });
    expect(
      await getActiveCategory(db, await slug('garment_category', inactive)),
    ).toBeNull();
    expect(await getActiveCategory(db, 'no-such-cat')).toBeNull();
    const areaId = await area('Used area Fake');
    await areaLink(await tailor(), areaId);
    expect(
      (await listActiveAreas(db, { onlyWithTailors: true })).map((a) => a.name),
    ).toContain('Used area Fake');
  });
});

describe('photos (BR-06)', () => {
  it('shows only permitted, visible photos in the gallery, with alt text', async () => {
    const t = await tailor();
    await photo(t, { alt: 'Shown' });
    await photo(t, { permission: 0, alt: 'No permission' });
    await photo(t, { visible: 0, alt: 'Hidden' });
    const view = (await getPublishedBySlug(db, await slugOf(t)))!;
    expect(view.photos.map((p) => p.alt)).toEqual(['Shown']);
    expect(view.photos[0].base).toMatch(
      new RegExp(`^tailor/${t}/[0-9a-f]{32}$`),
    );
  });

  it('uses the profile photo on cards only while it is permitted and visible', async () => {
    const t = await tailor({ name: 'Card Photo Fake' });
    const p = await photo(t);
    await db
      .prepare('UPDATE portfolio_image SET is_profile_photo = 1 WHERE id = ? AND tailor_id = ?')
      .bind(p, t)
      .run();
    const card = async () =>
      (await listPublished(db, none)).tailors.find(
        (c) => c.name === 'Card Photo Fake',
      )!;
    expect((await card()).photo).not.toBeNull();
    await db
      .prepare('UPDATE portfolio_image SET permission_granted = 0 WHERE id = ?')
      .bind(p)
      .run();
    expect((await card()).photo).toBeNull();
    await db
      .prepare(
        'UPDATE portfolio_image SET permission_granted = 1, is_visible = 0 WHERE id = ?',
      )
      .bind(p)
      .run();
    expect((await card()).photo).toBeNull();
  });
});

describe('filters (AC-02)', () => {
  it('narrow the list by category, area and home visits, alone and together', async () => {
    const [cat1, cat2] = [
      await category('Filter cat one Fake'),
      await category('Filter cat two Fake'),
    ];
    const [ar1, ar2] = [
      await area('Filter area one Fake'),
      await area('Filter area two Fake'),
    ];
    const a = await tailor({ name: 'Filter A Fake', homeVisits: 'yes' });
    const b = await tailor({ name: 'Filter B Fake', homeVisits: 'no' });
    const c = await tailor({ name: 'Filter C Fake', homeVisits: 'yes' });
    await tailor({
      name: 'Filter D Draft Fake',
      published: false,
      homeVisits: 'yes',
    });
    await link(a, cat1);
    await link(b, cat1);
    await link(c, cat2);
    await areaLink(a, ar1);
    await areaLink(b, ar2);
    await areaLink(c, ar1);
    const d = await db
      .prepare(
        "SELECT id FROM tailor WHERE display_name = 'Filter D Draft Fake'",
      )
      .first<{ id: number }>();
    await link(d!.id, cat1);
    await areaLink(d!.id, ar1);
    const [c1, c2, a1, a2] = [
      await slug('garment_category', cat1),
      await slug('garment_category', cat2),
      await slug('service_area', ar1),
      await slug('service_area', ar2),
    ];
    const pick = async (f: Partial<DirectoryFilters>) =>
      (await names({ ...none, ...f }))
        .filter((x) => x.startsWith('Filter '))
        .sort();
    expect(await pick({ category: c1 })).toEqual([
      'Filter A Fake',
      'Filter B Fake',
    ]);
    expect(await pick({ category: c2 })).toEqual(['Filter C Fake']);
    expect(await pick({ area: a1 })).toEqual([
      'Filter A Fake',
      'Filter C Fake',
    ]);
    expect(await pick({ area: a2 })).toEqual(['Filter B Fake']);
    expect(await pick({ homeVisit: true })).toEqual([
      'Filter A Fake',
      'Filter C Fake',
    ]);
    expect(await pick({ category: c1, area: a1 })).toEqual(['Filter A Fake']);
    expect(await pick({ category: c1, homeVisit: true })).toEqual([
      'Filter A Fake',
    ]);
    expect(await pick({ category: c1, area: a2, homeVisit: true })).toEqual([]);
    expect(await pick({ category: c2, area: a1, homeVisit: true })).toEqual([
      'Filter C Fake',
    ]);
  });

  it('give nothing for an unknown or deactivated category or area, and are safe against hostile values', async () => {
    const off = await category('Deactivated filter cat Fake', 0);
    await link(await tailor({ name: 'Filter Off Fake' }), off);
    expect(
      await names({ ...none, category: await slug('garment_category', off) }),
    ).toEqual([]);
    expect(await names({ ...none, category: 'no-such-category' })).toEqual([]);
    expect(await names({ ...none, area: "x' OR 1=1 --" })).toEqual([]);
  });
});

// Phase 7d: the header search finds published tailors by part of their name; wildcards are literal and a long search never breaks D1.
describe('searching by name', () => {
  it('matches part of a published name, case-insensitively, and never a draft', async () => {
    await tailor({ name: 'Searchable Atelier Fake' });
    await tailor({ name: 'Searchable Draft Fake', published: false });
    expect(await names({ ...none, q: 'searchable atel' })).toEqual([
      'Searchable Atelier Fake',
    ]);
    expect(await names({ ...none, q: 'Draft Fake' })).not.toContain(
      'Searchable Draft Fake',
    );
  });
  it('treats % and _ literally and survives a very long or emoji-heavy search', async () => {
    await tailor({ name: 'Percent 100% Fake' });
    expect(await names({ ...none, q: '100%' })).toEqual(['Percent 100% Fake']);
    expect(await names({ ...none, q: '%' })).toEqual(['Percent 100% Fake']);
    expect(await names({ ...none, q: '_' })).toEqual([]);
    await expect(names({ ...none, q: '🧵'.repeat(40) })).resolves.toEqual([]);
    await expect(names({ ...none, q: 'x'.repeat(200) })).resolves.toEqual([]);
  });
});
