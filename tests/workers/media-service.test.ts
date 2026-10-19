import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  removePhoto,
  setImagePermission,
  setProfilePhoto,
  setVisibility,
  updateDetails,
  uploadPhoto,
} from '../../src/modules/media/service';
import { imagePrefix } from '../../src/modules/media/keys';
import { jpeg } from './fixtures/images';

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
const user = async (role = 'manager') =>
  (
    await env.DB.prepare(
      'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
    )
      .bind(`s${++n}@example.test`, 'h', role)
      .run()
  ).meta.last_row_id;
const tailor = async (published = false) => {
  const id = (
    await env.DB.prepare(
      "INSERT INTO tailor (slug, display_name, phone_e164) VALUES (?, 'Service Fake', '+67077123456')",
    )
      .bind(`svc-${++n}`)
      .run()
  ).meta.last_row_id;
  if (published)
    await env.DB.prepare(
      "UPDATE tailor SET status = 'approved', permission_recorded = 1, contact_publish_consent = 1, is_published = 1 WHERE id = ?",
    )
      .bind(id)
      .run();
  return id;
};
const upload = async (by: number, role: string, id: number) =>
  uploadPhoto(b, by, role, id, { alt_text: 'A suit', variants: good() });
const publicCount = async (id: number) =>
  (await env.MEDIA_PUBLIC.list({ prefix: imagePrefix(id) })).objects.length;
const image = (imageId: number) =>
  env.DB.prepare('SELECT * FROM portfolio_image WHERE id = ?')
    .bind(imageId)
    .first<Record<string, unknown>>();

describe('the edit lock applies to photos', () => {
  it('lets an editor add and change photos on a draft but not on a published tailor', async () => {
    const [editor, draftId, publishedId] = [
      await user('editor'),
      await tailor(),
      await tailor(true),
    ];
    const ok = await upload(editor, 'editor', draftId);
    expect(ok.ok).toBe(true);
    expect(await upload(editor, 'editor', publishedId)).toEqual({
      ok: false,
      error: 'locked',
    });
    expect(await upload(editor, 'viewer', draftId)).toEqual({
      ok: false,
      error: 'locked',
    });
    if (!ok.ok) return;
    expect(
      await updateDetails(b, editor, 'editor', draftId, ok.id, {
        alt_text: 'New alt',
        caption: 'c',
      }),
    ).toEqual({ ok: true });
    expect((await image(ok.id))?.alt_text).toBe('New alt');
    const onPublished = await upload(await user(), 'manager', publishedId);
    if (!onPublished.ok) throw new Error('manager upload failed');
    expect(
      await updateDetails(b, editor, 'editor', publishedId, onPublished.id, {
        alt_text: 'sneaky',
      }),
    ).toEqual({ ok: false, error: 'locked' });
    expect(
      await setVisibility(
        b,
        editor,
        'editor',
        publishedId,
        onPublished.id,
        false,
      ),
    ).toEqual({ ok: false, error: 'locked' });
    expect(
      await removePhoto(b, editor, 'editor', publishedId, onPublished.id),
    ).toEqual({ ok: false, error: 'locked' });
  });

  it('reports an unknown tailor or an image that belongs to a different tailor', async () => {
    const [by, a, other] = [await user(), await tailor(), await tailor()];
    const stored = await upload(by, 'manager', a);
    if (!stored.ok) throw new Error('upload failed');
    expect(await upload(by, 'manager', 999999)).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(
      await updateDetails(b, by, 'manager', other, stored.id, {
        alt_text: 'x',
      }),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(
      await setVisibility(b, by, 'manager', other, stored.id, false),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(
      await setImagePermission(b, by, 'manager', other, stored.id, {
        granted: true,
        date: '2026-10-01',
      }),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(await setProfilePhoto(b, by, 'manager', other, stored.id)).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(await removePhoto(b, by, 'manager', other, stored.id)).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(await image(stored.id)).not.toBeNull();
  });
});

describe('details', () => {
  it('requires alt text and keeps caption optional', async () => {
    const [by, id] = [await user(), await tailor()];
    const stored = await upload(by, 'manager', id);
    if (!stored.ok) throw new Error('upload failed');
    expect(
      await updateDetails(b, by, 'manager', id, stored.id, { alt_text: '  ' }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await updateDetails(b, by, 'manager', id, stored.id, {
        alt_text: 'x'.repeat(201),
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await updateDetails(b, by, 'manager', id, stored.id, {
        alt_text: 'Fine',
        caption: '',
      }),
    ).toEqual({ ok: true });
    expect((await image(stored.id))?.caption).toBeNull();
  });
});

describe('permission to publish a photo (BR-06)', () => {
  it('is granted only by a manager or owner, with a real date, and starts as not granted', async () => {
    const [mgr, editor, id] = [
      await user('manager'),
      await user('editor'),
      await tailor(),
    ];
    const stored = await upload(mgr, 'manager', id);
    if (!stored.ok) throw new Error('upload failed');
    expect((await image(stored.id))?.permission_granted).toBe(0);
    expect(
      await setImagePermission(b, editor, 'editor', id, stored.id, {
        granted: true,
        date: '2026-10-01',
      }),
    ).toEqual({ ok: false, error: 'forbidden' });
    expect(
      await setImagePermission(b, mgr, 'manager', id, stored.id, {
        granted: true,
        date: '2026-02-30',
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await setImagePermission(b, mgr, 'manager', id, stored.id, {
        granted: true,
        date: '',
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect((await image(stored.id))?.permission_granted).toBe(0);
    expect(
      await setImagePermission(b, mgr, 'manager', id, stored.id, {
        granted: true,
        date: '2026-10-01',
      }),
    ).toEqual({ ok: true });
    expect(await image(stored.id)).toMatchObject({
      permission_granted: 1,
      permission_date: '2026-10-01',
    });
  });

  it('puts the photo in the public bucket only once the tailor is published, and takes it out when permission is withdrawn', async () => {
    const [mgr, draftId, liveId] = [
      await user('manager'),
      await tailor(),
      await tailor(true),
    ];
    const onDraft = await upload(mgr, 'manager', draftId);
    const onLive = await upload(mgr, 'manager', liveId);
    if (!onDraft.ok || !onLive.ok) throw new Error('upload failed');
    await setImagePermission(b, mgr, 'manager', draftId, onDraft.id, {
      granted: true,
      date: '2026-10-01',
    });
    await setImagePermission(b, mgr, 'manager', liveId, onLive.id, {
      granted: true,
      date: '2026-10-01',
    });
    expect(await publicCount(draftId)).toBe(0);
    expect(await publicCount(liveId)).toBe(3);
    await setImagePermission(b, mgr, 'manager', liveId, onLive.id, {
      granted: false,
    });
    expect(await publicCount(liveId)).toBe(0);
    expect(await image(onLive.id)).toMatchObject({
      permission_granted: 0,
      permission_date: null,
    });
  });

  it('hiding a photo removes it from the public bucket and showing it brings it back', async () => {
    const [mgr, id] = [await user('manager'), await tailor(true)];
    const stored = await upload(mgr, 'manager', id);
    if (!stored.ok) throw new Error('upload failed');
    await setImagePermission(b, mgr, 'manager', id, stored.id, {
      granted: true,
      date: '2026-10-01',
    });
    await setVisibility(b, mgr, 'manager', id, stored.id, false);
    expect(await publicCount(id)).toBe(0);
    await setVisibility(b, mgr, 'manager', id, stored.id, true);
    expect(await publicCount(id)).toBe(3);
  });
});

describe('profile photo', () => {
  it('can only be a photo that has permission and is visible', async () => {
    const [mgr, id] = [await user('manager'), await tailor()];
    const stored = await upload(mgr, 'manager', id);
    if (!stored.ok) throw new Error('upload failed');
    expect(await setProfilePhoto(b, mgr, 'manager', id, stored.id)).toEqual({
      ok: false,
      error: 'not_permitted',
    });
    await setImagePermission(b, mgr, 'manager', id, stored.id, {
      granted: true,
      date: '2026-10-01',
    });
    expect(await setProfilePhoto(b, mgr, 'manager', id, stored.id)).toEqual({
      ok: true,
    });
    expect(
      (
        await env.DB.prepare('SELECT profile_photo_id FROM tailor WHERE id = ?')
          .bind(id)
          .first<{ profile_photo_id: number }>()
      )?.profile_photo_id,
    ).toBe(stored.id);
  });

  it('is cleared when its permission is withdrawn, it is hidden or it is deleted', async () => {
    const [mgr, id] = [await user('manager'), await tailor(true)];
    const pointer = async () =>
      (
        await env.DB.prepare('SELECT profile_photo_id FROM tailor WHERE id = ?')
          .bind(id)
          .first<{ profile_photo_id: number | null }>()
      )?.profile_photo_id;
    for (const how of ['withdraw', 'hide', 'delete'] as const) {
      const stored = await upload(mgr, 'manager', id);
      if (!stored.ok) throw new Error('upload failed');
      await setImagePermission(b, mgr, 'manager', id, stored.id, {
        granted: true,
        date: '2026-10-01',
      });
      await setProfilePhoto(b, mgr, 'manager', id, stored.id);
      expect(await pointer()).toBe(stored.id);
      if (how === 'withdraw')
        await setImagePermission(b, mgr, 'manager', id, stored.id, {
          granted: false,
        });
      if (how === 'hide')
        await setVisibility(b, mgr, 'manager', id, stored.id, false);
      if (how === 'delete') await removePhoto(b, mgr, 'manager', id, stored.id);
      expect(await pointer(), how).toBeNull();
      await removePhoto(b, mgr, 'manager', id, stored.id);
    }
  });
});

describe('removePhoto', () => {
  it('deletes the files from both buckets and the row, even a public copy', async () => {
    const [mgr, id] = [await user('manager'), await tailor(true)];
    const stored = await upload(mgr, 'manager', id);
    if (!stored.ok) throw new Error('upload failed');
    await setImagePermission(b, mgr, 'manager', id, stored.id, {
      granted: true,
      date: '2026-10-01',
    });
    expect(await publicCount(id)).toBe(3);
    expect(await removePhoto(b, mgr, 'manager', id, stored.id)).toEqual({
      ok: true,
    });
    expect(await publicCount(id)).toBe(0);
    expect(
      (await env.MEDIA_PRIVATE.list({ prefix: imagePrefix(id) })).objects,
    ).toHaveLength(0);
    expect(await image(stored.id)).toBeNull();
  });
});
