import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, post, signIn, unique } from './helpers';
import { EXIF, GIF, PNG, jpeg, pad } from '../workers/fixtures/images';
import { LIMITS } from '../../src/modules/media/validate';
import { imagePrefix } from '../../src/modules/media/keys';

const good = () => ({
  thumb: jpeg({ width: 320, height: 240 }),
  medium: jpeg({ width: 800, height: 600 }),
  large: jpeg({ width: 1600, height: 1200 }),
});
const addTailor = async (published = false) => {
  const id = (
    await env.DB.prepare(
      "INSERT INTO tailor (slug, display_name, phone_e164) VALUES (?, 'Image Fake', '+67077123456')",
    )
      .bind(`img-${unique()}`)
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
const upload = async (
  cookie: string,
  id: number,
  parts: Partial<Record<'thumb' | 'medium' | 'large', Uint8Array>>,
  fields: Record<string, string> = {},
  csrf?: string,
) => {
  const form = new FormData();
  form.set('csrf', csrf ?? (await csrfOf(cookie)));
  form.set('alt_text', 'A fake jacket');
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const [name, bytes] of Object.entries(parts))
    form.set(
      name,
      new File([bytes as BlobPart], `${name}.jpg`, { type: 'image/jpeg' }),
    );
  return post(`/admin/tailors/${id}/images`, cookie, form);
};
const count = (id: number) =>
  env.DB.prepare(
    'SELECT count(*) AS c FROM portfolio_image WHERE tailor_id = ?',
  )
    .bind(id)
    .first<{ c: number }>()
    .then((r) => r!.c);
const inBucket = async (bucket: R2Bucket, id: number) =>
  (await bucket.list({ prefix: imagePrefix(id) })).objects.length;

describe('uploading a photo (SEC-04)', () => {
  it('stores three private variants and a metadata row for a valid upload', async () => {
    const cookie = await signIn('editor');
    const id = await addTailor();
    const response = await upload(cookie, id, good(), { caption: 'Wool' });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `/admin/tailors/${id}?msg=uploaded`,
    );
    expect(await count(id)).toBe(1);
    expect(await inBucket(env.MEDIA_PRIVATE, id)).toBe(3);
    expect(await inBucket(env.MEDIA_PUBLIC, id)).toBe(0);
  });

  const rejected: [
    string,
    () => Partial<Record<'thumb' | 'medium' | 'large', Uint8Array>>,
    string,
  ][] = [
    [
      'EXIF in one variant',
      () => ({
        ...good(),
        medium: jpeg({ width: 800, height: 600, before: [EXIF] }),
      }),
      'metadata',
    ],
    [
      'a PNG pretending to be a JPEG',
      () => ({ ...good(), thumb: PNG }),
      'not_jpeg',
    ],
    ['a GIF', () => ({ ...good(), large: GIF }), 'not_jpeg'],
    [
      'a missing variant',
      () => ({ thumb: good().thumb, medium: good().medium }),
      'missing_variant',
    ],
    [
      'a thumbnail that is too wide',
      () => ({ ...good(), thumb: jpeg({ width: 900, height: 600 }) }),
      'dimensions',
    ],
    [
      'an oversized variant',
      () => ({
        ...good(),
        thumb: pad(
          jpeg({ width: 300, height: 200 }),
          LIMITS.thumb.maxBytes + 10,
        ),
      }),
      'too_large',
    ],
  ];
  for (const [name, parts, code] of rejected) {
    it(`rejects ${name} and stores nothing`, async () => {
      const cookie = await signIn('editor');
      const id = await addTailor();
      const response = await upload(cookie, id, parts());
      expect(response.headers.get('location')).toBe(
        `/admin/tailors/${id}?msg=${code}`,
      );
      expect(await count(id)).toBe(0);
      expect(await inBucket(env.MEDIA_PRIVATE, id)).toBe(0);
    });
  }

  it('requires alt text', async () => {
    const cookie = await signIn('editor');
    const id = await addTailor();
    const response = await upload(cookie, id, good(), { alt_text: '   ' });
    expect(response.headers.get('location')).toBe(
      `/admin/tailors/${id}?msg=invalid`,
    );
    expect(await count(id)).toBe(0);
  });

  it('refuses the 11th photo', async () => {
    const cookie = await signIn('editor');
    const id = await addTailor();
    for (let i = 0; i < 10; i++)
      expect(
        (await upload(cookie, id, good())).headers.get('location'),
      ).toContain('msg=uploaded');
    expect((await upload(cookie, id, good())).headers.get('location')).toBe(
      `/admin/tailors/${id}?msg=limit`,
    );
    expect(await count(id)).toBe(10);
  });

  it('does not fail on a body that is not multipart', async () => {
    const cookie = await signIn('editor');
    const id = await addTailor();
    const response = await post(`/admin/tailors/${id}/images`, cookie, {
      csrf: await csrfOf(cookie),
      alt_text: 'x',
    });
    expect(response.headers.get('location')).toBe(
      `/admin/tailors/${id}?msg=missing_variant`,
    );
  });

  it('needs the csrf token', async () => {
    const cookie = await signIn('editor');
    const id = await addTailor();
    expect((await upload(cookie, id, good(), {}, 'wrong')).status).toBe(403);
    expect(await count(id)).toBe(0);
  });

  it('refuses a viewer, and an editor on a published tailor', async () => {
    const viewer = await signIn('viewer');
    const editor = await signIn('editor');
    const draft = await addTailor();
    const live = await addTailor(true);
    expect((await upload(viewer, draft, good(), {}, 'x')).status).toBe(403);
    expect((await upload(editor, live, good())).status).toBe(403);
    expect(await count(live)).toBe(0);
  });

  it('answers 404 for an unknown tailor', async () => {
    const cookie = await signIn('editor');
    expect((await upload(cookie, 999999, good())).status).toBe(404);
  });
});

describe('image actions and permission', () => {
  const firstImage = async (cookie: string, id: number) => {
    await upload(cookie, id, good());
    return (await env.DB.prepare(
      'SELECT id FROM portfolio_image WHERE tailor_id = ? ORDER BY id DESC',
    )
      .bind(id)
      .first<{ id: number }>())!.id;
  };
  const act = async (
    cookie: string,
    id: number,
    fields: Record<string, string>,
  ) =>
    post(`/admin/tailors/${id}/images/actions`, cookie, {
      csrf: await csrfOf(cookie),
      ...fields,
    });

  it('edits details and order, hides, and deletes', async () => {
    const cookie = await signIn('editor');
    const id = await addTailor();
    const imageId = await firstImage(cookie, id);
    expect(
      (
        await act(cookie, id, {
          action: 'details',
          image_id: String(imageId),
          alt_text: 'Blue shirt',
          caption: 'Cotton',
        })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${id}?msg=saved`);
    await act(cookie, id, {
      action: 'order',
      image_id: String(imageId),
      sort_order: '7',
    });
    await act(cookie, id, {
      action: 'visibility',
      image_id: String(imageId),
      visible: '0',
    });
    expect(
      await env.DB.prepare(
        'SELECT alt_text, caption, sort_order, is_visible FROM portfolio_image WHERE id = ?',
      )
        .bind(imageId)
        .first(),
    ).toEqual({
      alt_text: 'Blue shirt',
      caption: 'Cotton',
      sort_order: 7,
      is_visible: 0,
    });
    await act(cookie, id, { action: 'delete', image_id: String(imageId) });
    expect(await count(id)).toBe(0);
    expect(await inBucket(env.MEDIA_PRIVATE, id)).toBe(0);
  });

  it('refuses an editor changing a published tailor, and an image id from another tailor', async () => {
    const editor = await signIn('editor');
    const manager = await signIn('manager');
    const live = await addTailor(true);
    const other = await addTailor();
    const liveImage = await firstImage(manager, live);
    expect(
      (
        await act(editor, live, {
          action: 'visibility',
          image_id: String(liveImage),
          visible: '0',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await act(editor, other, {
          action: 'delete',
          image_id: String(liveImage),
        })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${other}?msg=not_found`);
    expect(await count(live)).toBe(1);
  });

  it('only a manager can grant permission, and then a published tailor shows the photo publicly; withdrawing removes it', async () => {
    const editor = await signIn('editor');
    const manager = await signIn('manager');
    const live = await addTailor(true);
    const imageId = await firstImage(manager, live);
    expect(
      (
        await post(`/admin/tailors/${live}/publish`, editor, {
          csrf: await csrfOf(editor),
          action: 'image_permission',
          image_id: String(imageId),
          granted: '1',
          permission_date: '2026-10-01',
        })
      ).status,
    ).toBe(403);
    expect(await inBucket(env.MEDIA_PUBLIC, live)).toBe(0);
    const csrf = await csrfOf(manager);
    expect(
      (
        await post(`/admin/tailors/${live}/publish`, manager, {
          csrf,
          action: 'image_permission',
          image_id: String(imageId),
          granted: '1',
          permission_date: '2026-10-01',
        })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${live}?msg=saved`);
    expect(await inBucket(env.MEDIA_PUBLIC, live)).toBe(3);
    await post(`/admin/tailors/${live}/publish`, manager, {
      csrf,
      action: 'image_permission',
      image_id: String(imageId),
      granted: '0',
    });
    expect(await inBucket(env.MEDIA_PUBLIC, live)).toBe(0);
    expect(await inBucket(env.MEDIA_PRIVATE, live)).toBe(3);
  });

  it('sets a profile photo only when permitted and visible', async () => {
    const manager = await signIn('manager');
    const id = await addTailor();
    const imageId = await firstImage(manager, id);
    expect(
      (
        await act(manager, id, {
          action: 'profile_photo',
          image_id: String(imageId),
        })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${id}?msg=not_permitted`);
    await post(`/admin/tailors/${id}/publish`, manager, {
      csrf: await csrfOf(manager),
      action: 'image_permission',
      image_id: String(imageId),
      granted: '1',
      permission_date: '2026-10-01',
    });
    expect(
      (
        await act(manager, id, {
          action: 'profile_photo',
          image_id: String(imageId),
        })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${id}?msg=saved`);
    expect(
      (
        await env.DB.prepare('SELECT profile_photo_id FROM tailor WHERE id = ?')
          .bind(id)
          .first<{ profile_photo_id: number }>()
      )?.profile_photo_id,
    ).toBe(imageId);
  });

  it('answers a bad request with a message, not an error', async () => {
    const cookie = await signIn('editor');
    const id = await addTailor();
    expect(
      (await act(cookie, id, { action: 'explode', image_id: '1' })).headers.get(
        'location',
      ),
    ).toBe(`/admin/tailors/${id}?msg=invalid`);
    expect(
      (
        await act(cookie, id, { action: 'delete', image_id: 'abc' })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${id}?msg=invalid`);
  });
});
