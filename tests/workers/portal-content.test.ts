import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import type { TailorSession } from '../../src/modules/portal/session';
import {
  portalProfileInput,
  savePortalProfile,
} from '../../src/modules/portal/profile';
import { saveWork, workView } from '../../src/modules/portal/work';
import {
  UPLOADS_PER_HOUR,
  deletePortalPhoto,
  updatePortalPhoto,
  uploadPortalPhoto,
} from '../../src/modules/portal/photos';
import { imagePrefix } from '../../src/modules/media/keys';
import { jpeg } from './fixtures/images';

const db = env.DB;
const b = {
  DB: env.DB,
  MEDIA_PRIVATE: env.MEDIA_PRIVATE,
  MEDIA_PUBLIC: env.MEDIA_PUBLIC,
};
let n = 0;
const good = () => ({
  thumb: jpeg({ width: 320, height: 240 }),
  medium: jpeg({ width: 800, height: 600 }),
  large: jpeg({ width: 1600, height: 1200 }),
});
const make = async (o: { published?: boolean; status?: string } = {}) => {
  const tailorId = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, whatsapp_e164, private_phone, fee_terms_text) VALUES (?, 'Content Fake', '+67077123456', '+67077999999', 'secret terms')",
      )
      .bind(`content-${++n}`)
      .run()
  ).meta.last_row_id;
  if (o.published)
    await db
      .prepare(
        "UPDATE tailor SET status = 'approved', permission_recorded = 1, contact_publish_consent = 1, is_published = 1, published_at = 'x' WHERE id = ?",
      )
      .bind(tailorId)
      .run();
  if (o.status)
    await db
      .prepare('UPDATE tailor SET status = ? WHERE id = ?')
      .bind(o.status, tailorId)
      .run();
  const accountId = (
    await db
      .prepare(
        'INSERT INTO tailor_account (tailor_id, email, password_hash) VALUES (?, ?, ?)',
      )
      .bind(tailorId, `c${n}@example.test`, 'x')
      .run()
  ).meta.last_row_id;
  const session: TailorSession = {
    accountId,
    tailorId,
    email: `c${n}@example.test`,
    csrfToken: 'x',
  };
  return session;
};
const row = (id: number) =>
  db
    .prepare('SELECT * FROM tailor WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('profile edits (FR-TPO-04)', () => {
  it('saves the allowed fields and records the tailor as the actor', async () => {
    const s = await make();
    const r = await savePortalProfile(
      db,
      s,
      form({
        display_name: 'New Name',
        description: 'I sew suits.',
        home_visits: 'yes',
        languages: 'Tetum',
        price_note: 'Shirts from $10',
        whatsapp: '7712 3456',
      }),
    );
    expect(r).toEqual({ ok: true });
    expect(await row(s.tailorId)).toMatchObject({
      display_name: 'New Name',
      description: 'I sew suits.',
      home_visits: 'yes',
      price_note: 'Shirts from $10',
      whatsapp_e164: '+67077123456',
    });
    const a = await db
      .prepare(
        "SELECT admin_user_id, tailor_account_id FROM audit_log WHERE entity_type = 'tailor' AND entity_id = ? ORDER BY id DESC",
      )
      .bind(s.tailorId)
      .first();
    expect(a).toEqual({ admin_user_id: null, tailor_account_id: s.accountId });
  });
  it('ignores every field a tailor must not set, even when sent', async () => {
    const s = await make();
    const before = await row(s.tailorId);
    const forged = form({
      display_name: 'Forged',
      slug: 'taken-over',
      status: 'approved',
      is_published: '1',
      published_at: 'x',
      permission_recorded: '1',
      contact_publish_consent: '1',
      verified_fields: '["description"]',
      fee_terms_text: 'free',
      fee_terms_agreed_on: '2026-01-01',
      private_contact_name: 'Hacker',
      private_phone: '+67070000000',
      price_confirmed_on: '2026-01-01',
      tailor_id: '1',
      profile_photo_id: '1',
    });
    expect(await savePortalProfile(db, s, forged)).toEqual({ ok: true });
    const after = await row(s.tailorId);
    expect(after).toMatchObject({ display_name: 'Forged' });
    for (const k of [
      'slug',
      'status',
      'is_published',
      'published_at',
      'permission_recorded',
      'contact_publish_consent',
      'verified_fields',
      'fee_terms_text',
      'fee_terms_agreed_on',
      'private_contact_name',
      'private_phone',
      'price_confirmed_on',
      'profile_photo_id',
    ])
      expect(after![k], k).toEqual(before![k]);
  });
  it('lets a published tailor change their words but not the numbers customers see', async () => {
    const s = await make({ published: true });
    expect(
      await savePortalProfile(
        db,
        s,
        form({
          display_name: 'Live Name',
          description: 'More words',
          whatsapp: '7799 0000',
          phone: '7788 0000',
        }),
      ),
    ).toEqual({ ok: true });
    expect(await row(s.tailorId)).toMatchObject({
      display_name: 'Live Name',
      description: 'More words',
      whatsapp_e164: '+67077123456',
      phone_e164: null,
    });
    expect(
      Object.keys(portalProfileInput(form({ whatsapp: '7799 0000' }), true)),
    ).not.toContain('whatsapp');
    expect(
      Object.keys(portalProfileInput(form({ whatsapp: '7799 0000' }), false)),
    ).toContain('whatsapp');
  });
  it('changing a verified fact makes it unverified again (BR-11)', async () => {
    const s = await make();
    await db
      .prepare(
        "UPDATE tailor SET description = 'checked text', verified_fields = '[\"description\"]' WHERE id = ?",
      )
      .bind(s.tailorId)
      .run();
    await savePortalProfile(
      db,
      s,
      form({ display_name: 'Content Fake', description: 'changed text' }),
    );
    expect(
      JSON.parse((await row(s.tailorId))!.verified_fields as string),
    ).toEqual([]);
  });
  it('refuses bad input and a suspended or archived page', async () => {
    const s = await make();
    expect(
      await savePortalProfile(db, s, form({ display_name: '' })),
    ).toMatchObject({ ok: false, error: 'invalid' });
    expect(
      await savePortalProfile(
        db,
        s,
        form({ display_name: 'X', whatsapp: '12345' }),
      ),
    ).toMatchObject({ ok: false, error: 'invalid' });
    for (const status of ['suspended', 'archived'])
      expect(
        await savePortalProfile(
          db,
          await make({ status }),
          form({ display_name: 'Nope' }),
        ),
      ).toEqual({ ok: false, error: 'locked' });
  });
  it('only ever touches the tailor of the session', async () => {
    const a = await make();
    const other = await make();
    await savePortalProfile(
      db,
      a,
      form({
        display_name: 'Only A',
        tailor_id: String(other.tailorId),
        id: String(other.tailorId),
      }),
    );
    expect((await row(other.tailorId))!.display_name).toBe('Content Fake');
  });
});

describe('work types and areas (FR-TPO-04)', () => {
  const catalog = async () => {
    const cat = (
      await db
        .prepare(
          "INSERT INTO garment_category (slug, name) VALUES (?, 'Cat Fake')",
        )
        .bind(`cat-p-${++n}`)
        .run()
    ).meta.last_row_id;
    const off = (
      await db
        .prepare(
          "INSERT INTO garment_category (slug, name, is_active) VALUES (?, 'Off Fake', 0)",
        )
        .bind(`cat-off-${++n}`)
        .run()
    ).meta.last_row_id;
    const area = (
      await db
        .prepare(
          "INSERT INTO service_area (slug, name) VALUES (?, 'Area Fake')",
        )
        .bind(`area-p-${++n}`)
        .run()
    ).meta.last_row_id;
    return { cat, off, area };
  };
  it('saves ticked types and areas, and unticking removes them', async () => {
    const s = await make();
    const c = await catalog();
    expect(
      await saveWork(
        db,
        s,
        form({
          [`cat_${c.cat}`]: 'on',
          [`shop_${c.area}`]: 'on',
          [`serves_${c.area}`]: 'on',
        }),
      ),
    ).toEqual({ ok: true });
    let v = await workView(db, s.tailorId);
    expect(v.chosen.has(c.cat)).toBe(true);
    expect(v.shop.has(c.area) && v.serves.has(c.area)).toBe(true);
    await saveWork(db, s, form({}));
    v = await workView(db, s.tailorId);
    expect([v.chosen.size, v.shop.size, v.serves.size]).toEqual([0, 0, 0]);
  });
  it('saves one part at a time: a step page never clears the other part, and the shop drop-down sets the shop place', async () => {
    const s = await make();
    const c = await catalog();
    await saveWork(
      db,
      s,
      form({
        part: 'types',
        [`cat_${c.cat}`]: 'on',
      }),
    );
    await saveWork(
      db,
      s,
      form({
        part: 'areas',
        shop_area: String(c.area),
        [`serves_${c.area}`]: 'on',
      }),
    );
    let v = await workView(db, s.tailorId);
    expect(v.chosen.has(c.cat)).toBe(true);
    expect(v.shop.has(c.area) && v.serves.has(c.area)).toBe(true);
    // the types step again: places are untouched; the places step with no shop and no ticks clears only places
    await saveWork(db, s, form({ part: 'types' }));
    v = await workView(db, s.tailorId);
    expect([v.chosen.size, v.shop.size, v.serves.size]).toEqual([0, 1, 1]);
    await saveWork(db, s, form({ part: 'areas', shop_area: '' }));
    v = await workView(db, s.tailorId);
    expect([v.shop.size, v.serves.size]).toEqual([0, 0]);
  });
  it('leaves a profile field alone when its step did not send it', async () => {
    const s = await make();
    await savePortalProfile(
      db,
      s,
      form({ display_name: 'Keep Name', description: 'Keep words' }),
    );
    await savePortalProfile(db, s, form({ whatsapp: '7799 0000' }));
    expect(await row(s.tailorId)).toMatchObject({
      display_name: 'Keep Name',
      description: 'Keep words',
      whatsapp_e164: '+67077990000',
    });
  });
  it('keeps prices and a verified price when only ticks change, and cannot verify anything', async () => {
    const s = await make();
    const c = await catalog();
    await db
      .prepare(
        "INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to, price_source, price_confirmed_on) VALUES (?, ?, 1000, 2000, 'verified', '2026-01-01')",
      )
      .bind(s.tailorId, c.cat)
      .run();
    await saveWork(
      db,
      s,
      form({
        [`cat_${c.cat}`]: 'on',
        [`source_${c.cat}`]: 'verified',
        [`from_${c.cat}`]: '1',
        [`to_${c.cat}`]: '2',
      }),
    );
    expect(
      await db
        .prepare(
          'SELECT price_from, price_to, price_source FROM tailor_category WHERE tailor_id = ?',
        )
        .bind(s.tailorId)
        .first(),
    ).toEqual({ price_from: 1000, price_to: 2000, price_source: 'verified' });
    const fresh = await make();
    await saveWork(
      db,
      fresh,
      form({
        [`cat_${c.cat}`]: 'on',
        [`source_${c.cat}`]: 'verified',
        [`from_${c.cat}`]: '1',
      }),
    );
    expect(
      await db
        .prepare(
          'SELECT price_from, price_source FROM tailor_category WHERE tailor_id = ?',
        )
        .bind(fresh.tailorId)
        .first(),
    ).toEqual({ price_from: null, price_source: 'tailor_supplied' });
  });
  it('never turns a price the tailor supplied into a verified one', async () => {
    const s = await make();
    const c = await catalog();
    await db
      .prepare(
        "INSERT INTO tailor_category (tailor_id, category_id, price_from, price_source) VALUES (?, ?, 500, 'tailor_supplied')",
      )
      .bind(s.tailorId, c.cat)
      .run();
    await saveWork(
      db,
      s,
      form({ [`cat_${c.cat}`]: 'on', [`source_${c.cat}`]: 'verified' }),
    );
    expect(
      await db
        .prepare(
          'SELECT price_from, price_source FROM tailor_category WHERE tailor_id = ?',
        )
        .bind(s.tailorId)
        .first(),
    ).toEqual({ price_from: 500, price_source: 'tailor_supplied' });
  });
  it('keeps a link to something the owner switched off, never adds one, and never touches another tailor', async () => {
    const s = await make();
    const other = await make();
    const c = await catalog();
    await db
      .prepare(
        'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
      )
      .bind(s.tailorId, c.off)
      .run();
    await db
      .prepare(
        'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
      )
      .bind(other.tailorId, c.cat)
      .run();
    await saveWork(
      db,
      s,
      form({ [`cat_${c.off}`]: 'on', [`cat_${c.cat}`]: 'on' }),
    );
    const mine = (
      await db
        .prepare(
          'SELECT category_id FROM tailor_category WHERE tailor_id = ? ORDER BY category_id',
        )
        .bind(s.tailorId)
        .all<{ category_id: number }>()
    ).results.map((r) => r.category_id);
    expect(mine).toEqual([c.cat, c.off].sort((a, b) => a - b));
    await saveWork(db, s, form({}));
    expect(
      (await db
        .prepare(
          'SELECT count(*) AS c FROM tailor_category WHERE tailor_id = ?',
        )
        .bind(other.tailorId)
        .first<{ c: number }>())!.c,
    ).toBe(1);
    expect(
      (await db
        .prepare(
          'SELECT count(*) AS c FROM tailor_category WHERE tailor_id = ? AND category_id = ?',
        )
        .bind(s.tailorId, c.off)
        .first<{ c: number }>())!.c,
    ).toBe(1);
  });
  it('is refused for a suspended page', async () => {
    expect(
      await saveWork(db, await make({ status: 'suspended' }), form({})),
    ).toEqual({ ok: false, error: 'locked' });
  });
});

describe('photos (FR-TPO-05)', () => {
  const up = (s: TailorSession, over: Record<string, unknown> = {}) =>
    uploadPortalPhoto(b, s, {
      alt_text: 'A shirt I made',
      confirmed: true,
      variants: good(),
      ...over,
    } as never);
  const img = (id: number) =>
    db
      .prepare('SELECT * FROM portfolio_image WHERE id = ?')
      .bind(id)
      .first<Record<string, unknown>>();
  it("stores a photo privately, hidden, with the tailor's confirmation recorded, and nothing reaches the public bucket", async () => {
    const s = await make();
    const r = await up(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await img(r.id)).toMatchObject({
      tailor_id: s.tailorId,
      is_visible: 0,
      permission_granted: 1,
    });
    expect(
      (await env.MEDIA_PRIVATE.list({ prefix: imagePrefix(s.tailorId) }))
        .objects.length,
    ).toBe(3);
    expect(
      (await env.MEDIA_PUBLIC.list({ prefix: imagePrefix(s.tailorId) })).objects
        .length,
    ).toBe(0);
    const a = await db
      .prepare(
        "SELECT admin_user_id, tailor_account_id FROM audit_log WHERE action = 'image_uploaded' AND entity_id = ?",
      )
      .bind(r.id)
      .first();
    expect(a).toEqual({ admin_user_id: null, tailor_account_id: s.accountId });
  });
  it('needs the confirmation and valid photos, and is limited per hour', async () => {
    const s = await make();
    expect(await up(s, { confirmed: false })).toEqual({
      ok: false,
      error: 'not_confirmed',
    });
    expect(
      await up(s, {
        variants: { ...good(), large: new Uint8Array([1, 2, 3]) },
      }),
    ).toMatchObject({ ok: false });
    expect(
      (await db
        .prepare(
          'SELECT count(*) AS c FROM portfolio_image WHERE tailor_id = ?',
        )
        .bind(s.tailorId)
        .first<{ c: number }>())!.c,
    ).toBe(0);
  });
  it('describes a photo for the tailor when they write nothing, so none is stored without alt text', async () => {
    const s = await make();
    const r = await up(s, { alt_text: '   ' });
    expect(r).toMatchObject({ ok: true });
    const row = await db
      .prepare('SELECT alt_text FROM portfolio_image WHERE tailor_id = ?')
      .bind(s.tailorId)
      .first<{ alt_text: string }>();
    expect(row!.alt_text).toMatch(/^Clothes made by /);
  });
  it('counts uploads per hour per tailor and then refuses more', async () => {
    const spam = await make();
    const T = new Date('2026-06-01T09:00:00Z');
    const results: unknown[] = [];
    for (let i = 0; i < UPLOADS_PER_HOUR + 1; i++)
      results.push(
        await uploadPortalPhoto(
          b,
          spam,
          { alt_text: 'x', confirmed: true, variants: good() },
          T,
        ),
      );
    expect(results.at(-1)).toEqual({ ok: false, error: 'limited' });
    expect(results[0]).toMatchObject({ ok: true });
    const other = await make();
    expect(
      (
        await uploadPortalPhoto(
          b,
          other,
          { alt_text: 'x', confirmed: true, variants: good() },
          T,
        )
      ).ok,
    ).toBe(true);
  });
  it('stops at 10 photos', async () => {
    const s = await make();
    const T = (i: number) => new Date(Date.UTC(2026, 5, 1, i * 2));
    for (let i = 0; i < 10; i++)
      expect(
        (
          await uploadPortalPhoto(
            b,
            s,
            { alt_text: 'x', confirmed: true, variants: good() },
            T(i),
          )
        ).ok,
      ).toBe(true);
    expect(
      await uploadPortalPhoto(
        b,
        s,
        { alt_text: 'x', confirmed: true, variants: good() },
        T(11),
      ),
    ).toEqual({ ok: false, error: 'limit' });
  });
  it('lets a tailor describe and remove only their own photos', async () => {
    const mine = await make();
    const theirs = await make();
    const a = await up(mine);
    const t = await up(theirs);
    if (!a.ok || !t.ok) throw new Error('setup');
    expect(
      await updatePortalPhoto(b, mine, a.id, { alt_text: 'New words' }),
    ).toEqual({ ok: true });
    expect((await img(a.id))!.alt_text).toBe('New words');
    expect(
      await updatePortalPhoto(b, mine, t.id, { alt_text: 'Hijack' }),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(await deletePortalPhoto(b, mine, t.id)).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect((await img(t.id))!.alt_text).toBe('A shirt I made');
    expect(await deletePortalPhoto(b, mine, a.id)).toEqual({ ok: true });
    expect(await img(a.id)).toBeNull();
    expect(
      (await env.MEDIA_PRIVATE.list({ prefix: imagePrefix(mine.tailorId) }))
        .objects.length,
    ).toBe(0);
  });
  it('is refused for a suspended or archived page', async () => {
    const s = await make({ status: 'suspended' });
    expect(await up(s)).toEqual({ ok: false, error: 'locked' });
  });
});
