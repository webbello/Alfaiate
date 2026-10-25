import { describe, expect, it } from 'vitest';
import { get, signIn } from './helpers';

// FR-ADM-15: the phone bottom bar lists only the lists a role may open, plus More.
const bar = (html: string) => {
  const m = /<nav class="admin-tabbar"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  if (!m) return null;
  return {
    links: [...m[1]!.matchAll(/<a href="([^"]+)"/g)].map((x) => x[1]),
    more: m[1]!.includes('for="admin-menu"'),
  };
};

describe('phone bottom bar', () => {
  it('shows each role only its own lists, and More', async () => {
    const owner = bar(
      await (await get('/admin', await signIn('owner'))).text(),
    );
    expect(owner).toEqual({
      links: ['/admin/enquiries', '/admin/orders', '/admin/tailors'],
      more: true,
    });
    const manager = bar(
      await (await get('/admin', await signIn('manager'))).text(),
    );
    expect(manager?.links).toEqual([
      '/admin/enquiries',
      '/admin/orders',
      '/admin/tailors',
    ]);
    const editor = bar(
      await (await get('/admin', await signIn('editor'))).text(),
    );
    expect(editor).toEqual({ links: ['/admin/tailors'], more: true });
    expect(
      bar(await (await get('/admin', await signIn('viewer'))).text()),
    ).toBeNull();
  });

  it('is not on the sign-in page', async () => {
    expect(bar(await (await get('/admin/login')).text())).toBeNull();
  });
});
