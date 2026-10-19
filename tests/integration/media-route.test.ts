import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';
import { jpeg } from '../workers/fixtures/images';
import { storeImage } from '../../src/modules/media/store';
import {
  setImagePermission,
  setVisibility,
} from '../../src/modules/media/service';
import {
  publishTailor,
  unpublishTailor,
} from '../../src/modules/tailors/publish';
import { imagePrefix, variantKey } from '../../src/modules/media/keys';

const b = {
  DB: env.DB,
  MEDIA_PRIVATE: env.MEDIA_PRIVATE,
  MEDIA_PUBLIC: env.MEDIA_PUBLIC,
};
const THUMB = jpeg({ width: 320, height: 240 });

async function setup(opts: { published?: boolean; permission?: boolean } = {}) {
  const manager = (
    await env.DB.prepare(
      'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
    )
      .bind(`mr${unique()}@example.test`, 'h', 'manager')
      .run()
  ).meta.last_row_id;
  const tailorId = (
    await env.DB.prepare(
      "INSERT INTO tailor (slug, display_name, phone_e164, status, permission_recorded, contact_publish_consent) VALUES (?, 'Media Fake', '+67077123456', 'approved', 1, 1)",
    )
      .bind(`mr-${unique()}`)
      .run()
  ).meta.last_row_id;
  const stored = await storeImage(b, manager, tailorId, {
    alt_text: 'x',
    variants: {
      thumb: THUMB,
      medium: jpeg({ width: 800, height: 600 }),
      large: jpeg({ width: 1600, height: 1200 }),
    },
  });
  if (!stored.ok) throw new Error('store failed');
  const key = (await env.DB.prepare(
    'SELECT file_key FROM portfolio_image WHERE id = ?',
  )
    .bind(stored.id)
    .first<{ file_key: string }>())!.file_key;
  if (opts.permission !== false)
    await setImagePermission(b, manager, 'manager', tailorId, stored.id, {
      granted: true,
      date: '2026-10-01',
    });
  if (opts.published !== false)
    await publishTailor(b, manager, 'manager', tailorId);
  return {
    manager,
    tailorId,
    imageId: stored.id,
    key,
    url: (variant: 'thumb' | 'medium' | 'large' = 'thumb') =>
      `/media/${variantKey(tailorId, key, variant)}`,
  };
}

describe('GET /media/<key> (public)', () => {
  it('serves a permitted, visible image of a published tailor, with safe headers and no cookie', async () => {
    const { url } = await setup();
    const response = await get(url());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(THUMB);
  });

  it('serves all three variants', async () => {
    const { url } = await setup();
    for (const variant of ['thumb', 'medium', 'large'] as const)
      expect((await get(url(variant))).status).toBe(200);
  });

  it('returns 404 for an image without recorded permission', async () => {
    const { url, tailorId } = await setup({ permission: false });
    expect((await get(url())).status).toBe(404);
    expect(
      (await env.MEDIA_PUBLIC.list({ prefix: imagePrefix(tailorId) })).objects,
    ).toHaveLength(0);
  });

  it('returns 404 for a hidden image, an unpublished tailor and a withdrawn permission', async () => {
    const hidden = await setup();
    await setVisibility(
      b,
      hidden.manager,
      'manager',
      hidden.tailorId,
      hidden.imageId,
      false,
    );
    expect((await get(hidden.url())).status).toBe(404);

    const unpublished = await setup();
    await unpublishTailor(
      b,
      unpublished.manager,
      'manager',
      unpublished.tailorId,
    );
    expect((await get(unpublished.url())).status).toBe(404);

    const withdrawn = await setup();
    await setImagePermission(
      b,
      withdrawn.manager,
      'manager',
      withdrawn.tailorId,
      withdrawn.imageId,
      { granted: false },
    );
    expect((await get(withdrawn.url())).status).toBe(404);
  });

  it('still returns 404 if a file lingers in the public bucket that the database does not allow (second line of defence)', async () => {
    const { url, tailorId, key, manager, imageId } = await setup();
    await setImagePermission(b, manager, 'manager', tailorId, imageId, {
      granted: false,
    });
    await env.MEDIA_PUBLIC.put(variantKey(tailorId, key, 'thumb'), THUMB); // simulate a failed cleanup
    expect((await get(url())).status).toBe(404);
    const stray = `${imagePrefix(tailorId)}${'f'.repeat(32)}/thumb.jpg`;
    await env.MEDIA_PUBLIC.put(stray, THUMB);
    expect((await get(`/media/${stray}`)).status).toBe(404);
  });

  it('never falls back to the private bucket: allowed by the database but absent from the public bucket is a 404', async () => {
    const { url, tailorId, imageId } = await setup({
      published: false,
      permission: false,
    });
    // Flags say "may be public" but reconcile has not run, so only the private copy exists.
    await env.DB.prepare('UPDATE tailor SET is_published = 1 WHERE id = ?')
      .bind(tailorId)
      .run();
    await env.DB.prepare(
      'UPDATE portfolio_image SET permission_granted = 1 WHERE id = ?',
    )
      .bind(imageId)
      .run();
    expect((await get(url())).status).toBe(404);
  });

  it('does not serve a lingering public file of an unpublished tailor even when the photo itself is permitted and visible', async () => {
    const { url, tailorId, key, manager } = await setup();
    await unpublishTailor(b, manager, 'manager', tailorId);
    await env.MEDIA_PUBLIC.put(variantKey(tailorId, key, 'thumb'), THUMB); // simulate a failed cleanup on unpublish
    expect((await get(url())).status).toBe(404);
  });

  it('returns 404 for the private copy, unknown keys, malformed keys and traversal attempts', async () => {
    const { tailorId, key } = await setup({ published: false });
    const good = variantKey(tailorId, key, 'thumb');
    const paths = [
      `/media/${good}`, // private only
      '/media/',
      '/media',
      `/media/tailor/${tailorId}/${'0'.repeat(32)}/thumb.jpg`,
      `/media/tailor/${tailorId}/${key}/thumb.png`,
      `/media/tailor/${tailorId}/${key}/original.jpg`,
      `/media/tailor/${tailorId}/../1/${key}/thumb.jpg`,
      `/media/tailor/${tailorId}/%2e%2e/${key}/thumb.jpg`,
      `/media/tailor%2F${tailorId}%2F${key}%2Fthumb.jpg`,
      `/media/${good.toUpperCase()}`,
      `/media/tailor/${tailorId}/`,
      '/media/tailor/',
    ];
    for (const path of paths) expect((await get(path)).status, path).toBe(404);
  });

  it('does not allow writes or listing through this route', async () => {
    const { url } = await setup();
    const response = await (
      await import('./worker')
    ).worker.fetch(
      new Request(`https://example.test${url()}`, {
        method: 'POST',
        body: 'x',
        headers: { Origin: 'https://example.test' },
      }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await get('/media/tailor/')).status).toBe(404);
  });
});

describe('GET /admin/media/<key> (private preview)', () => {
  it('sends an anonymous visitor to sign in, refuses a viewer, and shows an editor the private copy', async () => {
    const { url, tailorId, key } = await setup({
      published: false,
      permission: false,
    });
    const path = `/admin/media/${variantKey(tailorId, key, 'thumb')}`;
    void url;
    expect((await get(path)).status).toBe(302);
    expect((await get(path, await signIn('viewer'))).status).toBe(403);
    const response = await get(path, await signIn('editor'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(THUMB);
  });

  it('returns 404 for malformed or unknown keys, and never reads the public bucket', async () => {
    const editor = await signIn('editor');
    const { tailorId, key } = await setup();
    await env.MEDIA_PUBLIC.put(
      `${imagePrefix(tailorId)}${'a'.repeat(32)}/thumb.jpg`,
      THUMB,
    );
    for (const path of [
      '/admin/media/',
      '/admin/media/x',
      `/admin/media/tailor/${tailorId}/${'a'.repeat(32)}/thumb.jpg`,
      `/admin/media/tailor/${tailorId}/../${key}/thumb.jpg`,
    ]) {
      expect((await get(path, editor)).status, path).toBe(404);
    }
  });
});
