import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  canEdit,
  createDraft,
  getTailor,
  listTailors,
  updateProfile,
} from '../../src/modules/tailors/repo';

const db = env.DB;
let n = 0;
const actor = async () =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(`t${++n}@example.test`, 'h', 'editor')
      .run()
  ).meta.last_row_id;
const draft = async (
  name = `Fake Tailor ${++n}`,
  extra: Record<string, string> = {},
) => {
  const by = await actor();
  const created = await createDraft(db, by, { display_name: name, ...extra });
  if (!created.ok) throw new Error(`create failed: ${JSON.stringify(created)}`);
  return { by, id: created.id, slug: created.slug };
};
const publishRaw = (id: number) =>
  db
    .prepare(
      "UPDATE tailor SET status = 'approved', permission_recorded = 1, is_published = 1, published_at = '2026-01-01T00:00:00Z' WHERE id = ?",
    )
    .bind(id)
    .run();

describe('createDraft', () => {
  it('creates a draft, unpublished, with nothing verified and a slug from the name', async () => {
    const { id, slug } = await draft('Alfaiate São João');
    expect(slug).toBe('alfaiate-sao-joao');
    const t = (await getTailor(db, id))!;
    expect(t).toMatchObject({
      status: 'draft',
      is_published: 0,
      permission_recorded: 0,
      contact_publish_consent: 0,
      home_visits: 'unknown',
      verified_fields: '[]',
    });
  });

  it('gives two tailors with the same name different slugs', async () => {
    const a = await draft('Twin Name');
    const b = await draft('Twin Name');
    expect(a.slug).toBe('twin-name');
    expect(b.slug).toBe('twin-name-2');
  });

  it('stores phone numbers as E.164 and accepts local forms', async () => {
    const { id } = await draft('Phones', {
      whatsapp: '7712 3456',
      phone: '+670 3312 3456',
    });
    const t = (await getTailor(db, id))!;
    expect(t.whatsapp_e164).toBe('+67077123456');
    expect(t.phone_e164).toBe('+67033123456');
  });

  it('names the fields that are wrong instead of failing silently', async () => {
    const by = await actor();
    const result = await createDraft(db, by, {
      display_name: '',
      whatsapp: '12345',
      phone: 'abc',
      description: 'x'.repeat(2001),
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.fields.sort()).toEqual([
        'description',
        'display_name',
        'phone',
        'whatsapp',
      ]);
  });

  it('enforces length limits on name, address, languages and price note', async () => {
    const by = await actor();
    for (const [field, max] of [
      ['display_name', 120],
      ['shop_address_text', 300],
      ['languages', 200],
      ['price_note', 200],
    ] as const) {
      const result = await createDraft(db, by, {
        display_name: 'Ok',
        [field]: 'x'.repeat(max + 1),
      });
      expect(result.ok, field).toBe(false);
    }
  });

  it('rejects an impossible price-confirmed date and an unknown home_visits value', async () => {
    const by = await actor();
    expect(
      (
        await createDraft(db, by, {
          display_name: 'D',
          price_confirmed_on: '2026-13-45',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await createDraft(db, by, {
          display_name: 'D',
          home_visits: 'sometimes' as never,
        })
      ).ok,
    ).toBe(false);
  });

  it('audits by id only', async () => {
    const { by } = await draft('Secret Shop Name');
    const rows = await db
      .prepare(
        "SELECT * FROM audit_log WHERE action = 'tailor_created' AND admin_user_id = ?",
      )
      .bind(by)
      .all();
    expect(rows.results.length).toBe(1);
    expect(JSON.stringify(rows.results)).not.toContain('Secret Shop Name');
  });
});

describe('updateProfile and the edit lock', () => {
  it('lets an editor update a draft', async () => {
    const { by, id } = await draft();
    expect(
      await updateProfile(db, by, 'editor', id, {
        display_name: 'Renamed',
        description: 'Suits and alterations',
      }),
    ).toEqual({ ok: true });
    expect((await getTailor(db, id))?.display_name).toBe('Renamed');
  });

  it('keeps the slug when the name changes', async () => {
    const { by, id, slug } = await draft('Keeps Slug');
    await updateProfile(db, by, 'editor', id, {
      display_name: 'Totally Different',
    });
    expect((await getTailor(db, id))?.slug).toBe(slug);
  });

  it('refuses an editor on a published tailor but allows a manager and an owner', async () => {
    const { by, id } = await draft();
    await publishRaw(id);
    expect(
      await updateProfile(db, by, 'editor', id, { display_name: 'Sneaky' }),
    ).toEqual({ ok: false, error: 'locked' });
    expect(
      await updateProfile(db, by, 'viewer', id, { display_name: 'Sneaky' }),
    ).toEqual({ ok: false, error: 'locked' });
    expect((await getTailor(db, id))?.display_name).not.toBe('Sneaky');
    expect(
      await updateProfile(db, by, 'manager', id, {
        display_name: 'By Manager',
      }),
    ).toEqual({ ok: true });
    expect(
      await updateProfile(db, by, 'owner', id, { display_name: 'By Owner' }),
    ).toEqual({ ok: true });
  });

  it('canEdit follows the same rule', async () => {
    const { id } = await draft();
    const t = (await getTailor(db, id))!;
    expect(canEdit('editor', t)).toBe(true);
    expect(canEdit('viewer', t)).toBe(false);
    expect(canEdit('manager', { ...t, is_published: 1 })).toBe(true);
    expect(canEdit('editor', { ...t, is_published: 1 })).toBe(false);
  });

  it('lets the slug change only before the tailor has ever been published', async () => {
    const { by, id } = await draft('Slug Edit');
    expect(
      await updateProfile(db, by, 'editor', id, {
        display_name: 'Slug Edit',
        slug: 'my-new-slug',
      }),
    ).toEqual({ ok: true });
    expect((await getTailor(db, id))?.slug).toBe('my-new-slug');
    await publishRaw(id);
    expect(
      await updateProfile(db, by, 'manager', id, {
        display_name: 'Slug Edit',
        slug: 'another-slug',
      }),
    ).toEqual({ ok: false, error: 'slug_locked' });
    await db
      .prepare('UPDATE tailor SET is_published = 0 WHERE id = ?')
      .bind(id)
      .run();
    expect(
      await updateProfile(db, by, 'manager', id, {
        display_name: 'Slug Edit',
        slug: 'another-slug',
      }),
    ).toEqual({ ok: false, error: 'slug_locked' });
  });

  it('refuses a slug that is taken or not URL-safe', async () => {
    const a = await draft('Taken Slug');
    const b = await draft('Other One');
    expect(
      await updateProfile(db, b.by, 'editor', b.id, {
        display_name: 'Other One',
        slug: a.slug,
      }),
    ).toEqual({ ok: false, error: 'slug_taken' });
    const bad = await updateProfile(db, b.by, 'editor', b.id, {
      display_name: 'Other One',
      slug: 'Has Spaces/../x',
    });
    expect(bad.ok).toBe(false);
  });

  it('reports an unknown tailor', async () => {
    const by = await actor();
    expect(
      await updateProfile(db, by, 'editor', 99999, { display_name: 'x' }),
    ).toEqual({ ok: false, error: 'not_found' });
  });

  it('cannot touch publishing, permission, verification or fee fields through the profile form', async () => {
    const { by, id } = await draft();
    await updateProfile(db, by, 'editor', id, {
      display_name: 'Mass Assignment',
      status: 'approved',
      is_published: 1,
      permission_recorded: 1,
      verified_fields: '["description"]',
      fee_terms_text: 'free money',
    } as never);
    const t = (await getTailor(db, id))!;
    expect(t).toMatchObject({
      status: 'draft',
      is_published: 0,
      permission_recorded: 0,
      verified_fields: '[]',
      fee_terms_text: null,
    });
  });
});

describe('listTailors', () => {
  it('filters by status and by published', async () => {
    const a = await draft('List A');
    const b = await draft('List B');
    await publishRaw(b.id);
    const published = (await listTailors(db, { published: true })).map(
      (t) => t.id,
    );
    expect(published).toContain(b.id);
    expect(published).not.toContain(a.id);
    const drafts = (await listTailors(db, { status: 'draft' })).map(
      (t) => t.id,
    );
    expect(drafts).toContain(a.id);
    expect(drafts).not.toContain(b.id);
  });

  it('refuses an unknown status filter instead of building SQL from it', async () => {
    await expect(
      listTailors(db, { status: "draft' OR 1=1 --" as never }),
    ).rejects.toThrow();
  });

  it('does not expose private or fee fields in list rows', async () => {
    const { id } = await draft('Private Fields');
    const row = (await listTailors(db, {})).find((t) => t.id === id)!;
    expect(Object.keys(row)).not.toContain('fee_terms_text');
    expect(Object.keys(row)).not.toContain('private_phone');
  });
});
