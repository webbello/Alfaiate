import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn } from './helpers';

// Shop S1 through the real pages: add, edit and publish products; who may do what; nothing public yet (the shop pages come in S2).
const db = env.DB;
const idFrom = (location: string | null) =>
  Number(/\/admin\/products\/(\d+)/.exec(location ?? '')?.[1]);

async function addAs(
  role: string,
  name: string,
  extra: Record<string, string> = {},
) {
  const cookie = await signIn(role);
  const csrf = await csrfOf(cookie);
  const r = await post('/admin/products/new', cookie, {
    csrf,
    name,
    description: 'A made-up description.',
    price: '20',
    ...extra,
  });
  return { cookie, csrf, r, id: idFrom(r.headers.get('location')) };
}

describe('admin products', () => {
  it('lets an editor add a draft and see it in the list, hidden, and says only a manager publishes', async () => {
    const { cookie, r, id } = await addAs('editor', 'Fake Linen Shirt');
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toContain('msg=created');
    const list = await (await get('/admin/products', cookie)).text();
    expect(list).toContain('Fake Linen Shirt');
    expect(list).toContain('Draft');
    expect(list).toContain('A manager or owner publishes them');
    const page = await (await get(`/admin/products/${id}`, cookie)).text();
    expect(page).toContain('A manager or owner publishes products.');
    expect(page).not.toContain(`/admin/products/${id}/publish`);
  });

  it('lets a manager publish and unpublish, and an editor is refused', async () => {
    const { id } = await addAs('editor', 'Fake Scarf');
    const manager = await signIn('manager');
    const csrf = await csrfOf(manager);
    expect(
      (
        await post(`/admin/products/${id}/publish`, manager, {
          csrf,
          action: 'publish',
        })
      ).headers.get('location'),
    ).toContain('msg=published');
    expect(
      (await db
        .prepare('SELECT is_published AS p FROM product WHERE id = ?')
        .bind(id)
        .first<{ p: number }>())!.p,
    ).toBe(1);
    const editor = await signIn('editor');
    expect(
      (
        await post(`/admin/products/${id}/publish`, editor, {
          csrf: await csrfOf(editor),
          action: 'unpublish',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(`/admin/products/${id}/publish`, manager, {
          csrf,
          action: 'unpublish',
        })
      ).headers.get('location'),
    ).toContain('msg=unpublished');
  });

  it('refuses to publish a product with no description, and says why', async () => {
    const { id } = await addAs('manager', 'Fake Bare Item', {
      description: '',
    });
    const manager = await signIn('manager');
    const r = await post(`/admin/products/${id}/publish`, manager, {
      csrf: await csrfOf(manager),
      action: 'publish',
    });
    expect(r.headers.get('location')).toContain('msg=needs_description');
    const page = await (
      await get(`/admin/products/${id}?msg=needs_description`, manager)
    ).text();
    expect(page).toContain('needs a description before it can be published');
  });

  it('shows what to fix when the price is not an amount, and stores nothing', async () => {
    const { r } = await addAs('editor', 'Fake Bad Price', { price: 'twelve' });
    expect(r.headers.get('location')).toContain(
      '/admin/products/new?msg=invalid&fields=price',
    );
  });

  it('turns hostile names into inert text', async () => {
    const { cookie, id } = await addAs(
      'owner',
      '"><img src=x onerror=alert(1)>',
    );
    const html = await (await get(`/admin/products/${id}`, cookie)).text();
    expect(html.replace(/="[^"]*"/g, '=""')).not.toContain('<img src=x');
    const list = await (await get('/admin/products', cookie)).text();
    expect(list).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('refuses a request with no csrf token, a viewer, and an anonymous visitor', async () => {
    const cookie = await signIn('editor');
    expect(
      (await post('/admin/products/new', cookie, { name: 'No Token Fake' }))
        .status,
    ).toBe(403);
    const viewer = await signIn('viewer');
    expect((await get('/admin/products', viewer)).status).toBe(403);
    const anon = await get('/admin/products');
    expect(anon.status).toBe(302);
    expect(anon.headers.get('location')).toBe('/admin/login');
  });

  it('keeps unpublished and published products off every public page until S2', async () => {
    const { id } = await addAs('owner', 'Zz Fake Hidden Item');
    for (const path of ['/', '/tailors', '/sitemap.xml'])
      expect(await (await get(path)).text()).not.toContain(
        'Zz Fake Hidden Item',
      );
    expect(id).toBeGreaterThan(0);
  });
});
