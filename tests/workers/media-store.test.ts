import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  MAX_IMAGES,
  deleteImage,
  storeImage,
} from '../../src/modules/media/store';
import { imagePrefix, parseVariantKey } from '../../src/modules/media/keys';
import { EXIF, jpeg } from './fixtures/images';
import { override } from './fixtures/override';

const buckets = {
  DB: env.DB,
  MEDIA_PRIVATE: env.MEDIA_PRIVATE,
  MEDIA_PUBLIC: env.MEDIA_PUBLIC,
};
let n = 0;
const actor = async () =>
  (
    await env.DB.prepare(
      'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
    )
      .bind(`m${++n}@example.test`, 'h', 'editor')
      .run()
  ).meta.last_row_id;
const tailor = async () =>
  (
    await env.DB.prepare(
      'INSERT INTO tailor (slug, display_name) VALUES (?, ?)',
    )
      .bind(`store-${++n}`, 'Store Fake')
      .run()
  ).meta.last_row_id;
const good = () => ({
  thumb: jpeg({ width: 320, height: 240 }),
  medium: jpeg({ width: 800, height: 600 }),
  large: jpeg({ width: 1600, height: 1200 }),
});
const keysIn = async (bucket: R2Bucket, tailorId: number) =>
  (await bucket.list({ prefix: imagePrefix(tailorId) })).objects
    .map((o) => o.key)
    .sort();

describe('storeImage', () => {
  it('writes three variants to the private bucket only, plus one metadata row without any permission', async () => {
    const [by, id] = [await actor(), await tailor()];
    const result = await storeImage(buckets, by, id, {
      alt_text: 'A grey suit on a hanger',
      caption: 'Wool',
      variants: good(),
    });
    expect(result.ok).toBe(true);
    const keys = await keysIn(env.MEDIA_PRIVATE, id);
    expect(keys.map((k) => parseVariantKey(k)?.variant).sort()).toEqual([
      'large',
      'medium',
      'thumb',
    ]);
    expect(await keysIn(env.MEDIA_PUBLIC, id)).toEqual([]);
    const row = await env.DB.prepare(
      'SELECT file_key, alt_text, caption, permission_granted, is_visible FROM portfolio_image WHERE tailor_id = ?',
    )
      .bind(id)
      .first<Record<string, unknown>>();
    expect(row).toMatchObject({
      alt_text: 'A grey suit on a hanger',
      caption: 'Wool',
      permission_granted: 0,
      is_visible: 1,
    });
    expect(keys.every((k) => k.includes(String(row?.file_key)))).toBe(true);
  });

  it('keeps image bytes out of the database: no BLOB column, no large text', async () => {
    const cols = await env.DB.prepare(
      "SELECT name, type FROM pragma_table_info('portfolio_image')",
    ).all<{ name: string; type: string }>();
    expect(cols.results.some((c) => /blob/i.test(c.type))).toBe(false);
  });

  it('rejects the whole upload and stores nothing when one variant fails validation (EXIF)', async () => {
    const [by, id] = [await actor(), await tailor()];
    const variants = {
      ...good(),
      medium: jpeg({ width: 800, height: 600, before: [EXIF] }),
    };
    expect(
      await storeImage(buckets, by, id, { alt_text: 'x', variants }),
    ).toEqual({ ok: false, error: 'metadata' });
    expect(await keysIn(env.MEDIA_PRIVATE, id)).toEqual([]);
    expect(
      await env.DB.prepare('SELECT 1 FROM portfolio_image WHERE tailor_id = ?')
        .bind(id)
        .first(),
    ).toBeNull();
  });

  it('rejects a missing variant, a variant in the wrong slot and missing alt text', async () => {
    const [by, id] = [await actor(), await tailor()];
    const { thumb, medium } = good();
    expect(
      await storeImage(buckets, by, id, {
        alt_text: 'x',
        variants: { thumb, medium } as never,
      }),
    ).toEqual({ ok: false, error: 'missing_variant' });
    expect(
      await storeImage(buckets, by, id, {
        alt_text: 'x',
        variants: { ...good(), thumb: jpeg({ width: 800, height: 600 }) },
      }),
    ).toEqual({ ok: false, error: 'dimensions' });
    expect(
      await storeImage(buckets, by, id, { alt_text: '  ', variants: good() }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await storeImage(buckets, by, id, {
        alt_text: 'x'.repeat(201),
        variants: good(),
      }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(await keysIn(env.MEDIA_PRIVATE, id)).toEqual([]);
  });

  it('refuses an unknown tailor and the 11th photo of one tailor', async () => {
    const [by, id] = [await actor(), await tailor()];
    expect(
      await storeImage(buckets, by, 999999, {
        alt_text: 'x',
        variants: good(),
      }),
    ).toEqual({ ok: false, error: 'not_found' });
    for (let i = 0; i < MAX_IMAGES; i++)
      expect(
        (
          await storeImage(buckets, by, id, {
            alt_text: `photo ${i}`,
            variants: good(),
          })
        ).ok,
      ).toBe(true);
    expect(
      await storeImage(buckets, by, id, {
        alt_text: 'one too many',
        variants: good(),
      }),
    ).toEqual({ ok: false, error: 'limit' });
    expect((await keysIn(env.MEDIA_PRIVATE, id)).length).toBe(MAX_IMAGES * 3);
    expect(MAX_IMAGES).toBe(10);
  });

  it('keeps the 10-photo cap when uploads arrive in parallel, and leaves no files for the refused ones', async () => {
    const [by, id] = [await actor(), await tailor()];
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        storeImage(buckets, by, id, { alt_text: `p${i}`, variants: good() }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_IMAGES);
    expect(results.filter((r) => !r.ok && r.error === 'limit')).toHaveLength(5);
    expect(
      (
        await env.DB.prepare(
          'SELECT count(*) AS c FROM portfolio_image WHERE tailor_id = ?',
        )
          .bind(id)
          .first<{ c: number }>()
      )?.c,
    ).toBe(MAX_IMAGES);
    expect(await keysIn(env.MEDIA_PRIVATE, id)).toHaveLength(MAX_IMAGES * 3);
  });

  it('cleans up the stored files if the database insert fails', async () => {
    const [by, id] = [await actor(), await tailor()];
    const flaky = {
      ...buckets,
      DB: override(env.DB, {
        prepare: (sql: string) =>
          sql.startsWith('INSERT INTO portfolio_image')
            ? {
                bind: () => ({
                  run: async () => {
                    throw new Error('boom');
                  },
                }),
              }
            : env.DB.prepare(sql),
      } as never),
    };
    await expect(
      storeImage(flaky as never, by, id, { alt_text: 'x', variants: good() }),
    ).resolves.toEqual({ ok: false, error: 'storage' });
    expect(await keysIn(env.MEDIA_PRIVATE, id)).toEqual([]);
  });

  it('cleans up and reports an error if the storage write fails part way', async () => {
    const [by, id] = [await actor(), await tailor()];
    let puts = 0;
    const flakyBucket = override(env.MEDIA_PRIVATE, {
      put: async (...args: Parameters<R2Bucket['put']>) => {
        if (++puts === 2) throw new Error('r2 down');
        return env.MEDIA_PRIVATE.put(...args);
      },
    } as never);
    expect(
      await storeImage({ ...buckets, MEDIA_PRIVATE: flakyBucket }, by, id, {
        alt_text: 'x',
        variants: good(),
      }),
    ).toEqual({ ok: false, error: 'storage' });
    expect(await keysIn(env.MEDIA_PRIVATE, id)).toEqual([]);
    expect(
      await env.DB.prepare('SELECT 1 FROM portfolio_image WHERE tailor_id = ?')
        .bind(id)
        .first(),
    ).toBeNull();
  });

  it('audits by id only', async () => {
    const [by, id] = [await actor(), await tailor()];
    await storeImage(buckets, by, id, {
      alt_text: 'Secret alt words',
      variants: good(),
    });
    const rows = await env.DB.prepare(
      "SELECT * FROM audit_log WHERE action = 'image_uploaded' AND admin_user_id = ?",
    )
      .bind(by)
      .all();
    expect(rows.results.length).toBe(1);
    expect(JSON.stringify(rows.results)).not.toContain('Secret alt words');
  });
});

describe('deleteImage', () => {
  it('removes the files from both buckets, then the row, and clears the profile photo', async () => {
    const [by, id] = [await actor(), await tailor()];
    const stored = await storeImage(buckets, by, id, {
      alt_text: 'x',
      variants: good(),
    });
    if (!stored.ok) throw new Error('store failed');
    const key = (await env.DB.prepare(
      'SELECT file_key FROM portfolio_image WHERE id = ?',
    )
      .bind(stored.id)
      .first<{ file_key: string }>())!.file_key;
    for (const variant of ['thumb', 'medium', 'large'] as const)
      await env.MEDIA_PUBLIC.put(`tailor/${id}/${key}/${variant}.jpg`, 'x');
    await env.DB.prepare('UPDATE portfolio_image SET is_profile_photo = 1 WHERE id = ? AND tailor_id = ?')
      .bind(stored.id, id)
      .run();
    expect(await deleteImage(buckets, by, id, stored.id)).toEqual({ ok: true });
    expect(await keysIn(env.MEDIA_PRIVATE, id)).toEqual([]);
    expect(await keysIn(env.MEDIA_PUBLIC, id)).toEqual([]);
    expect(
      await env.DB.prepare('SELECT 1 FROM portfolio_image WHERE id = ?')
        .bind(stored.id)
        .first(),
    ).toBeNull();
    expect(
      (
        await env.DB.prepare('SELECT (SELECT p.id FROM portfolio_image p WHERE p.tailor_id = tailor.id AND p.is_profile_photo = 1) AS profile_photo_id FROM tailor WHERE id = ?')
          .bind(id)
          .first<{ profile_photo_id: number | null }>()
      )?.profile_photo_id,
    ).toBeNull();
  });

  it('keeps the row, so it can be retried, when removing a file fails', async () => {
    const [by, id] = [await actor(), await tailor()];
    const stored = await storeImage(buckets, by, id, {
      alt_text: 'x',
      variants: good(),
    });
    if (!stored.ok) throw new Error('store failed');
    const failing = override(env.MEDIA_PRIVATE, {
      delete: async () => {
        throw new Error('r2 down');
      },
    } as never);
    await expect(
      deleteImage({ ...buckets, MEDIA_PRIVATE: failing }, by, id, stored.id),
    ).rejects.toThrow();
    expect(
      await env.DB.prepare('SELECT 1 FROM portfolio_image WHERE id = ?')
        .bind(stored.id)
        .first(),
    ).not.toBeNull();
    expect(await deleteImage(buckets, by, id, stored.id)).toEqual({ ok: true });
  });

  it('refuses an image that belongs to another tailor or does not exist', async () => {
    const [by, a, b] = [await actor(), await tailor(), await tailor()];
    const stored = await storeImage(buckets, by, a, {
      alt_text: 'x',
      variants: good(),
    });
    if (!stored.ok) throw new Error('store failed');
    expect(await deleteImage(buckets, by, b, stored.id)).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(await deleteImage(buckets, by, a, 999999)).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect((await keysIn(env.MEDIA_PRIVATE, a)).length).toBe(3);
  });
});
