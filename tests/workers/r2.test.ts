import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';

// Confirms the local R2 simulation in the Workers test project works before anything depends on it.
describe('local R2', () => {
  it('stores, reads, lists and deletes objects in both buckets, which are separate', async () => {
    await env.MEDIA_PRIVATE.put('probe/a.txt', 'private');
    await env.MEDIA_PUBLIC.put('probe/b.txt', 'public');
    expect(await (await env.MEDIA_PRIVATE.get('probe/a.txt'))!.text()).toBe(
      'private',
    );
    expect(await env.MEDIA_PRIVATE.get('probe/b.txt')).toBeNull();
    expect(
      (await env.MEDIA_PUBLIC.list({ prefix: 'probe/' })).objects.map(
        (o) => o.key,
      ),
    ).toEqual(['probe/b.txt']);
    await env.MEDIA_PRIVATE.delete('probe/a.txt');
    await env.MEDIA_PUBLIC.delete('probe/b.txt');
    expect(await env.MEDIA_PRIVATE.get('probe/a.txt')).toBeNull();
  });
});
