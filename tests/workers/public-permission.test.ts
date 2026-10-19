import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  getPublishedBySlug,
  listActiveAreas,
  listActiveCategories,
  listPublished,
  listSitemapPaths,
} from '../../src/modules/directory/queries';
import { preselectedTailor } from '../../src/modules/enquiry/queries';
import { resolveChoices } from '../../src/modules/enquiry/schema';
import { recordContactClick } from '../../src/modules/analytics/contact-click';

// BR-06 defence in depth: a row flagged published but WITHOUT recorded permission (a bad manual edit, a future write path) must stay invisible everywhere.
const db = env.DB;
let n = 0;
// The database already refuses `is_published = 1` without permission (a CHECK), so the bad row is built with the check switched off, then switched on again.
const setup = async () => {
  await db.exec('PRAGMA ignore_check_constraints = ON');
  const slug = `pp-${++n}`;
  const tailor = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, description, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164, phone_e164) VALUES (?, ?, 'Fake text', 'approved', 1, 0, 1, '+67077123456', '+67033123456')",
      )
      .bind(slug, `PP Unpermitted ${n}`)
      .run()
  ).meta.last_row_id as number;
  const cat = (
    await db
      .prepare('INSERT INTO garment_category (slug, name) VALUES (?, ?)')
      .bind(`pp-cat-${n}`, `PP Cat ${n}`)
      .run()
  ).meta.last_row_id as number;
  const area = (
    await db
      .prepare('INSERT INTO service_area (slug, name) VALUES (?, ?)')
      .bind(`pp-area-${n}`, `PP Area ${n}`)
      .run()
  ).meta.last_row_id as number;
  await db
    .prepare(
      'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
    )
    .bind(tailor, cat)
    .run();
  await db
    .prepare(
      "INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, 'serves')",
    )
    .bind(tailor, area)
    .run();
  return { slug, tailor, catSlug: `pp-cat-${n}`, areaSlug: `pp-area-${n}` };
};
const grant = (id: number) =>
  db
    .prepare('UPDATE tailor SET permission_recorded = 1 WHERE id = ?')
    .bind(id)
    .run();

describe('a published tailor without recorded permission is never public (BR-06)', () => {
  it('is left out of the directory, the profile lookup and the sitemap', async () => {
    const t = await setup();
    const all = await listPublished(db, {
      category: undefined,
      area: undefined,
      homeVisit: false,
    });
    expect(all.tailors.map((c) => c.slug)).not.toContain(t.slug);
    expect(
      await listPublished(db, {
        category: t.catSlug,
        area: undefined,
        homeVisit: false,
      }),
    ).toMatchObject({ tailors: [] });
    expect(await getPublishedBySlug(db, t.slug)).toBeNull();
    expect(await listSitemapPaths(db)).not.toContain(`/tailors/${t.slug}`);
  });

  it('does not make its categories or areas appear as having tailors', async () => {
    const t = await setup();
    expect(
      (await listActiveCategories(db, { onlyWithTailors: true })).map(
        (c) => c.slug,
      ),
    ).not.toContain(t.catSlug);
    expect(
      (await listActiveAreas(db, { onlyWithTailors: true })).map((a) => a.slug),
    ).not.toContain(t.areaSlug);
    expect(await listSitemapPaths(db)).not.toContain(
      `/categories/${t.catSlug}`,
    );
  });

  it('cannot be preselected on the request form or counted by the tap counter', async () => {
    const t = await setup();
    expect(await preselectedTailor(db, t.slug)).toBeNull();
    const resolved = await resolveChoices(db, {
      name: 'x',
      phone: '+67077123456',
      channel: 'phone',
      categoryId: null,
      service: null,
      areaId: null,
      areaText: null,
      when: null,
      notes: null,
      tailorSlug: t.slug,
    });
    expect(resolved).toMatchObject({
      ok: true,
      tailorId: null,
      source: 'form',
    });
    expect(
      await recordContactClick(
        db,
        { slug: t.slug, channel: 'phone' },
        undefined,
      ),
    ).toBe('not_found');
  });

  it('appears everywhere as soon as permission is recorded', async () => {
    const t = await setup();
    await grant(t.tailor);
    expect(await getPublishedBySlug(db, t.slug)).not.toBeNull();
    expect(await listSitemapPaths(db)).toContain(`/tailors/${t.slug}`);
    expect(await preselectedTailor(db, t.slug)).not.toBeNull();
    expect(
      (await listActiveCategories(db, { onlyWithTailors: true })).map(
        (c) => c.slug,
      ),
    ).toContain(t.catSlug);
  });
});
