import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { reconcileImages } from '../../src/modules/media/reconcile';
import { storeImage } from '../../src/modules/media/store';
import { imagePrefix } from '../../src/modules/media/keys';
import { jpeg } from './fixtures/images';
import { override } from './fixtures/override';

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
const actor = async () =>
  (
    await env.DB.prepare(
      'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
    )
      .bind(`r${++n}@example.test`, 'h', 'manager')
      .run()
  ).meta.last_row_id;
const keysIn = async (bucket: R2Bucket, tailorId: number) =>
  (await bucket.list({ prefix: imagePrefix(tailorId) })).objects
    .map((o) => o.key)
    .sort();

async function setup(opts: {
  published: boolean;
  permission: boolean;
  visible: boolean;
}) {
  const by = await actor();
  const tailorId = (
    await env.DB.prepare(
      'INSERT INTO tailor (slug, display_name) VALUES (?, ?)',
    )
      .bind(`rec-${++n}`, 'Reconcile Fake')
      .run()
  ).meta.last_row_id;
  const stored = await storeImage(b, by, tailorId, {
    alt_text: 'x',
    variants: good(),
  });
  if (!stored.ok) throw new Error('store failed');
  await setState(tailorId, stored.id, opts);
  return { by, tailorId, imageId: stored.id };
}
async function setState(
  tailorId: number,
  imageId: number,
  s: { published: boolean; permission: boolean; visible: boolean },
) {
  await env.DB.prepare(
    "UPDATE tailor SET status = 'approved', permission_recorded = 1, is_published = ? WHERE id = ?",
  )
    .bind(s.published ? 1 : 0, tailorId)
    .run();
  await env.DB.prepare(
    'UPDATE portfolio_image SET permission_granted = ?, is_visible = ? WHERE id = ?',
  )
    .bind(s.permission ? 1 : 0, s.visible ? 1 : 0, imageId)
    .run();
}

describe('reconcileImages: the publicity rule (BR-06)', () => {
  for (const published of [false, true]) {
    for (const permission of [false, true]) {
      for (const visible of [false, true]) {
        const expected = published && permission && visible;
        it(`published=${published} permission=${permission} visible=${visible} -> ${expected ? 'public' : 'private only'}`, async () => {
          const { tailorId } = await setup({ published, permission, visible });
          await reconcileImages(b, tailorId);
          expect((await keysIn(env.MEDIA_PUBLIC, tailorId)).length).toBe(
            expected ? 3 : 0,
          );
          expect((await keysIn(env.MEDIA_PRIVATE, tailorId)).length).toBe(3); // the private copy is never removed by reconcile
        });
      }
    }
  }
});

describe('reconcileImages: transitions', () => {
  it('moves an image in and out of the public bucket as permission, visibility and publication change', async () => {
    const { tailorId, imageId } = await setup({
      published: true,
      permission: true,
      visible: true,
    });
    await reconcileImages(b, tailorId);
    expect((await keysIn(env.MEDIA_PUBLIC, tailorId)).length).toBe(3);
    await setState(tailorId, imageId, {
      published: true,
      permission: false,
      visible: true,
    });
    await reconcileImages(b, tailorId);
    expect(await keysIn(env.MEDIA_PUBLIC, tailorId)).toEqual([]);
    await setState(tailorId, imageId, {
      published: true,
      permission: true,
      visible: false,
    });
    await reconcileImages(b, tailorId);
    expect(await keysIn(env.MEDIA_PUBLIC, tailorId)).toEqual([]);
    await setState(tailorId, imageId, {
      published: false,
      permission: true,
      visible: true,
    });
    await reconcileImages(b, tailorId);
    expect(await keysIn(env.MEDIA_PUBLIC, tailorId)).toEqual([]);
    await setState(tailorId, imageId, {
      published: true,
      permission: true,
      visible: true,
    });
    await reconcileImages(b, tailorId);
    expect((await keysIn(env.MEDIA_PUBLIC, tailorId)).length).toBe(3);
  });

  it('copies identical bytes, and is idempotent', async () => {
    const { tailorId } = await setup({
      published: true,
      permission: true,
      visible: true,
    });
    expect(await reconcileImages(b, tailorId)).toMatchObject({
      added: 3,
      removed: 0,
    });
    expect(await reconcileImages(b, tailorId)).toMatchObject({
      added: 0,
      removed: 0,
    });
    for (const key of await keysIn(env.MEDIA_PUBLIC, tailorId)) {
      const [pub, priv] = await Promise.all([
        env.MEDIA_PUBLIC.get(key),
        env.MEDIA_PRIVATE.get(key),
      ]);
      expect(new Uint8Array(await pub!.arrayBuffer())).toEqual(
        new Uint8Array(await priv!.arrayBuffer()),
      );
    }
  });

  it('removes a stray public object that no permitted image explains', async () => {
    const { tailorId } = await setup({
      published: true,
      permission: true,
      visible: true,
    });
    await env.MEDIA_PUBLIC.put(
      `${imagePrefix(tailorId)}${'e'.repeat(32)}/thumb.jpg`,
      'stray',
    );
    await reconcileImages(b, tailorId);
    expect((await keysIn(env.MEDIA_PUBLIC, tailorId)).length).toBe(3);
  });

  it('clears the profile photo when its image stops being public, and keeps it while public', async () => {
    const { tailorId, imageId } = await setup({
      published: true,
      permission: true,
      visible: true,
    });
    await env.DB.prepare('UPDATE tailor SET profile_photo_id = ? WHERE id = ?')
      .bind(imageId, tailorId)
      .run();
    await reconcileImages(b, tailorId);
    expect(
      (
        await env.DB.prepare('SELECT profile_photo_id FROM tailor WHERE id = ?')
          .bind(tailorId)
          .first<{ profile_photo_id: number | null }>()
      )?.profile_photo_id,
    ).toBe(imageId);
    await setState(tailorId, imageId, {
      published: true,
      permission: false,
      visible: true,
    });
    await reconcileImages(b, tailorId);
    expect(
      (
        await env.DB.prepare('SELECT profile_photo_id FROM tailor WHERE id = ?')
          .bind(tailorId)
          .first<{ profile_photo_id: number | null }>()
      )?.profile_photo_id,
    ).toBeNull();
  });

  it('only touches the given tailor: tailor 1 never disturbs tailor 10-style prefixes or other tailors', async () => {
    const a = await setup({ published: true, permission: true, visible: true });
    const other = await setup({
      published: true,
      permission: true,
      visible: true,
    });
    await reconcileImages(b, other.tailorId);
    await setState(a.tailorId, a.imageId, {
      published: true,
      permission: false,
      visible: true,
    });
    await reconcileImages(b, a.tailorId);
    expect((await keysIn(env.MEDIA_PUBLIC, other.tailorId)).length).toBe(3);
  });

  it('reports, without crashing, a permitted image whose private files are missing', async () => {
    const { tailorId } = await setup({
      published: true,
      permission: true,
      visible: true,
    });
    for (const key of await keysIn(env.MEDIA_PRIVATE, tailorId))
      await env.MEDIA_PRIVATE.delete(key);
    const result = await reconcileImages(b, tailorId);
    expect(result.missing.length).toBe(3);
    expect(await keysIn(env.MEDIA_PUBLIC, tailorId)).toEqual([]);
  });

  it('converges on retry after a storage failure, never leaving an unpermitted file public', async () => {
    const { tailorId, imageId } = await setup({
      published: true,
      permission: true,
      visible: true,
    });
    await reconcileImages(b, tailorId);
    await setState(tailorId, imageId, {
      published: true,
      permission: false,
      visible: true,
    });
    const failing = override(env.MEDIA_PUBLIC, {
      delete: async () => {
        throw new Error('r2 down');
      },
    } as never);
    await expect(
      reconcileImages({ ...b, MEDIA_PUBLIC: failing }, tailorId),
    ).rejects.toThrow();
    await reconcileImages(b, tailorId);
    expect(await keysIn(env.MEDIA_PUBLIC, tailorId)).toEqual([]);
  });

  it('handles more than one page of public objects', async () => {
    const { tailorId } = await setup({
      published: false,
      permission: true,
      visible: true,
    });
    for (let i = 0; i < 1100; i++)
      await env.MEDIA_PUBLIC.put(
        `${imagePrefix(tailorId)}${i.toString(16).padStart(32, '0')}/thumb.jpg`,
        'x',
      );
    await reconcileImages(b, tailorId);
    expect(await keysIn(env.MEDIA_PUBLIC, tailorId)).toEqual([]);
  });
});
