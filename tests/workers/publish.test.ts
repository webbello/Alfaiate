import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  approveTailor,
  publishBlockers,
  publishTailor,
  recordPermission,
  setVerifiedFields,
  unpublishTailor,
  withdrawPermission,
} from '../../src/modules/tailors/publish';
import { VERIFIABLE_FIELDS } from '../../src/modules/tailors/verification';
import { storeImage } from '../../src/modules/media/store';
import { reconcileImages } from '../../src/modules/media/reconcile';
import { imagePrefix } from '../../src/modules/media/keys';
import { getTailor } from '../../src/modules/tailors/repo';
import { jpeg } from './fixtures/images';

const b = {
  DB: env.DB,
  MEDIA_PRIVATE: env.MEDIA_PRIVATE,
  MEDIA_PUBLIC: env.MEDIA_PUBLIC,
};
let n = 0;
const user = async (role = 'manager') =>
  (
    await env.DB.prepare(
      'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
    )
      .bind(`p${++n}@example.test`, 'h', role)
      .run()
  ).meta.last_row_id;
const tailor = async (extra = '') =>
  (
    await env.DB.prepare(
      `INSERT INTO tailor (slug, display_name, phone_e164 ${extra ? ', ' + extra.split('=')[0] : ''}) VALUES (?, 'Publish Fake', '+67077123456' ${extra ? ', ' + extra.split('=')[1] : ''})`,
    )
      .bind(`pub-${++n}`)
      .run()
  ).meta.last_row_id;
const keysIn = async (bucket: R2Bucket, id: number) =>
  (await bucket.list({ prefix: imagePrefix(id) })).objects.length;
const good = () => ({
  thumb: jpeg({ width: 320, height: 240 }),
  medium: jpeg({ width: 800, height: 600 }),
  large: jpeg({ width: 1600, height: 1200 }),
});

/** A tailor that meets every publishing requirement. */
async function ready() {
  const by = await user('manager');
  const id = await tailor();
  expect(await approveTailor(b, by, 'manager', id)).toEqual({ ok: true });
  expect(
    await recordPermission(b, by, 'manager', id, {
      note: 'Agreed in person with the owner',
      date: '2026-10-01',
      contact_publish_consent: true,
    }),
  ).toEqual({ ok: true });
  return { by, id };
}

describe('publishBlockers', () => {
  const base = {
    status: 'approved',
    permission_recorded: 1,
    contact_publish_consent: 1,
    whatsapp_e164: null,
    phone_e164: '+67077123456',
  } as const;
  it('returns nothing for a fully qualified tailor', () => {
    expect(publishBlockers(base)).toEqual([]);
  });
  it('names every missing requirement', () => {
    expect(publishBlockers({ ...base, status: 'draft' as never })).toEqual([
      'not_approved',
    ]);
    expect(publishBlockers({ ...base, permission_recorded: 0 })).toEqual([
      'no_permission_recorded',
    ]);
    expect(publishBlockers({ ...base, contact_publish_consent: 0 })).toEqual([
      'no_consented_contact',
    ]);
    expect(publishBlockers({ ...base, phone_e164: null })).toEqual([
      'no_consented_contact',
    ]);
    expect(
      publishBlockers({
        ...base,
        phone_e164: null,
        whatsapp_e164: '+67077123456',
      }),
    ).toEqual([]);
    expect(
      publishBlockers({
        status: 'suspended' as never,
        permission_recorded: 0,
        contact_publish_consent: 0,
        whatsapp_e164: null,
        phone_e164: null,
      }),
    ).toEqual([
      'not_approved',
      'no_permission_recorded',
      'no_consented_contact',
    ]);
  });
});

describe('publishTailor (AC-10)', () => {
  it('publishes a tailor that meets every requirement and records when', async () => {
    const { by, id } = await ready();
    expect(await publishTailor(b, by, 'manager', id)).toEqual({ ok: true });
    const t = (await getTailor(env.DB, id))!;
    expect(t.is_published).toBe(1);
    expect(t.published_at).toMatch(/^\d{4}-/);
  });

  it('refuses, with the reasons, and changes nothing when something is missing', async () => {
    const by = await user();
    const id = await tailor();
    expect(await publishTailor(b, by, 'manager', id)).toEqual({
      ok: false,
      error: 'blocked',
      blockers: [
        'not_approved',
        'no_permission_recorded',
        'no_consented_contact',
      ],
    });
    expect((await getTailor(env.DB, id))?.is_published).toBe(0);
    await approveTailor(b, by, 'manager', id);
    expect(await publishTailor(b, by, 'manager', id)).toMatchObject({
      ok: false,
      blockers: ['no_permission_recorded', 'no_consented_contact'],
    });
  });

  it('is also refused by the database itself if the application check were bypassed', async () => {
    const id = await tailor();
    await expect(
      env.DB.prepare('UPDATE tailor SET is_published = 1 WHERE id = ?')
        .bind(id)
        .run(),
    ).rejects.toThrow();
    await env.DB.prepare("UPDATE tailor SET status = 'approved' WHERE id = ?")
      .bind(id)
      .run();
    await expect(
      env.DB.prepare('UPDATE tailor SET is_published = 1 WHERE id = ?')
        .bind(id)
        .run(),
    ).rejects.toThrow();
  });

  it('is refused for an editor, a viewer and an unknown tailor', async () => {
    const { id } = await ready();
    const editor = await user('editor');
    expect(await publishTailor(b, editor, 'editor', id)).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await publishTailor(b, editor, 'viewer', id)).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await publishTailor(b, editor, 'manager', 999999)).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect((await getTailor(env.DB, id))?.is_published).toBe(0);
  });

  it('puts permitted, visible images in the public bucket on publish and takes them out on unpublish', async () => {
    const { by, id } = await ready();
    const stored = await storeImage(b, by, id, {
      alt_text: 'x',
      variants: good(),
    });
    if (!stored.ok) throw new Error('store failed');
    await env.DB.prepare(
      'UPDATE portfolio_image SET permission_granted = 1 WHERE id = ?',
    )
      .bind(stored.id)
      .run();
    await reconcileImages(b, id);
    expect(await keysIn(env.MEDIA_PUBLIC, id)).toBe(0); // permitted but the tailor is not published yet
    await publishTailor(b, by, 'manager', id);
    expect(await keysIn(env.MEDIA_PUBLIC, id)).toBe(3);
    expect(await unpublishTailor(b, by, 'manager', id)).toEqual({ ok: true });
    expect(await keysIn(env.MEDIA_PUBLIC, id)).toBe(0);
    expect(await keysIn(env.MEDIA_PRIVATE, id)).toBe(3);
    await publishTailor(b, by, 'manager', id);
    expect(await keysIn(env.MEDIA_PUBLIC, id)).toBe(3);
  });

  it('audits publish and unpublish by id', async () => {
    const { by, id } = await ready();
    await publishTailor(b, by, 'manager', id);
    await unpublishTailor(b, by, 'manager', id);
    const actions = (
      await env.DB.prepare(
        'SELECT action FROM audit_log WHERE admin_user_id = ? AND entity_id = ?',
      )
        .bind(by, id)
        .all<{ action: string }>()
    ).results.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(['tailor_published', 'tailor_unpublished']),
    );
  });
});

describe('approveTailor and recordPermission', () => {
  it('approves a draft, and only a manager or owner may', async () => {
    const id = await tailor();
    const editor = await user('editor');
    expect(await approveTailor(b, editor, 'editor', id)).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await approveTailor(b, editor, 'owner', id)).toEqual({ ok: true });
    expect((await getTailor(env.DB, id))?.status).toBe('approved');
  });

  it('refuses to approve an archived or suspended tailor', async () => {
    const by = await user();
    const id = await tailor("status='archived'");
    expect(await approveTailor(b, by, 'manager', id)).toEqual({
      ok: false,
      error: 'invalid_state',
    });
  });

  it('records who/when/how permission was given and the contact consent (BR-06, PRV-06)', async () => {
    const by = await user();
    const id = await tailor();
    expect(
      await recordPermission(b, by, 'manager', id, {
        note: 'Phone call, tailor agreed',
        date: '2026-10-02',
        contact_publish_consent: true,
      }),
    ).toEqual({ ok: true });
    expect(await getTailor(env.DB, id)).toMatchObject({
      permission_recorded: 1,
      permission_note: 'Phone call, tailor agreed',
      permission_date: '2026-10-02',
      contact_publish_consent: 1,
    });
  });

  it('needs a note and a real date, and refuses editors', async () => {
    const by = await user();
    const id = await tailor();
    expect(
      await recordPermission(b, by, 'manager', id, {
        note: '  ',
        date: '2026-10-02',
        contact_publish_consent: true,
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await recordPermission(b, by, 'manager', id, {
        note: 'ok',
        date: '2026-02-30',
        contact_publish_consent: true,
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await recordPermission(b, by, 'editor', id, {
        note: 'ok',
        date: '2026-10-02',
        contact_publish_consent: true,
      }),
    ).toEqual({ ok: false, error: 'forbidden' });
    expect((await getTailor(env.DB, id))?.permission_recorded).toBe(0);
  });

  it('withdrawing permission from a published tailor unpublishes it, clears consent and removes its public images', async () => {
    const { by, id } = await ready();
    const stored = await storeImage(b, by, id, {
      alt_text: 'x',
      variants: good(),
    });
    if (!stored.ok) throw new Error('store failed');
    await env.DB.prepare(
      'UPDATE portfolio_image SET permission_granted = 1 WHERE id = ?',
    )
      .bind(stored.id)
      .run();
    await publishTailor(b, by, 'manager', id);
    expect(await keysIn(env.MEDIA_PUBLIC, id)).toBe(3);
    expect(await withdrawPermission(b, by, 'manager', id)).toEqual({
      ok: true,
    });
    expect(await getTailor(env.DB, id)).toMatchObject({
      is_published: 0,
      permission_recorded: 0,
      contact_publish_consent: 0,
    });
    expect(await keysIn(env.MEDIA_PUBLIC, id)).toBe(0);
    expect(await withdrawPermission(b, by, 'editor', id)).toEqual({
      ok: false,
      error: 'forbidden',
    });
  });
});

describe('setVerifiedFields (BR-11)', () => {
  it('stores only known fields, once each, and only for a manager or owner', async () => {
    const by = await user();
    const id = await tailor();
    expect(
      await setVerifiedFields(b, by, 'manager', id, [
        'languages',
        'description',
        'languages',
      ]),
    ).toEqual({ ok: true });
    expect(JSON.parse((await getTailor(env.DB, id))!.verified_fields)).toEqual([
      'description',
      'languages',
    ]);
    expect(await setVerifiedFields(b, by, 'manager', id, ['rating'])).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(
      await setVerifiedFields(b, by, 'editor', id, ['description']),
    ).toEqual({ ok: false, error: 'forbidden' });
    expect(JSON.parse((await getTailor(env.DB, id))!.verified_fields)).toEqual([
      'description',
      'languages',
    ]);
  });

  it('can clear all verification, and every allowed field name is accepted', async () => {
    const by = await user();
    const id = await tailor();
    expect(
      await setVerifiedFields(b, by, 'owner', id, [...VERIFIABLE_FIELDS]),
    ).toEqual({ ok: true });
    expect(await setVerifiedFields(b, by, 'owner', id, [])).toEqual({
      ok: true,
    });
    expect((await getTailor(env.DB, id))?.verified_fields).toBe('[]');
  });

  it('knows no field for ratings, credentials or claims (BR-11)', () => {
    for (const forbidden of [
      'rating',
      'credentials',
      'claims',
      'reviews',
      'awards',
    ])
      expect(VERIFIABLE_FIELDS as readonly string[]).not.toContain(forbidden);
  });
});
