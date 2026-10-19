import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn } from './helpers';

for (const [path, table] of [
  ['/admin/categories', 'garment_category'],
  ['/admin/areas', 'service_area'],
] as const) {
  describe(path, () => {
    it('lets an editor add an entry and shows it in the list', async () => {
      const cookie = await signIn('editor');
      const csrf = await csrfOf(cookie);
      const added = await post(path, cookie, {
        csrf,
        action: 'create',
        name: 'Fake Entry One',
      });
      expect(added.status).toBe(303);
      expect(added.headers.get('location')).toBe(`${path}?msg=added`);
      const html = await (await get(path, cookie)).text();
      expect(html).toContain('Fake Entry One');
    });

    it('refuses a post without the csrf token and changes nothing', async () => {
      const cookie = await signIn('editor');
      const response = await post(path, cookie, {
        action: 'create',
        name: 'Should Not Exist',
      });
      expect(response.status).toBe(403);
      expect(
        await env.DB.prepare(
          `SELECT 1 FROM ${table} WHERE name = 'Should Not Exist'`,
        ).first(),
      ).toBeNull();
    });

    it('refuses a viewer on both GET and POST', async () => {
      const cookie = await signIn('viewer');
      expect((await get(path, cookie)).status).toBe(403);
      expect(
        (
          await post(path, cookie, {
            csrf: 'x',
            action: 'create',
            name: 'Viewer Entry',
          })
        ).status,
      ).toBe(403);
      expect(
        await env.DB.prepare(
          `SELECT 1 FROM ${table} WHERE name = 'Viewer Entry'`,
        ).first(),
      ).toBeNull();
    });

    it('renames, reorders and deactivates through the form', async () => {
      const cookie = await signIn('manager');
      const csrf = await csrfOf(cookie);
      await post(path, cookie, { csrf, action: 'create', name: 'To Change' });
      const row = (await env.DB.prepare(
        `SELECT id FROM ${table} WHERE name = 'To Change'`,
      ).first<{ id: number }>())!;
      expect(
        (
          await post(path, cookie, {
            csrf,
            action: 'rename',
            id: String(row.id),
            name: 'Changed Name',
          })
        ).headers.get('location'),
      ).toBe(`${path}?msg=saved`);
      await post(path, cookie, {
        csrf,
        action: 'set_order',
        id: String(row.id),
        sort_order: '-99',
      });
      await post(path, cookie, {
        csrf,
        action: 'set_active',
        id: String(row.id),
        active: '0',
      });
      const stored = await env.DB.prepare(
        `SELECT name, sort_order, is_active FROM ${table} WHERE id = ?`,
      )
        .bind(row.id)
        .first();
      expect(stored).toEqual({
        name: 'Changed Name',
        sort_order: -99,
        is_active: 0,
      });
    });

    it('answers an invalid name or unknown action with the invalid message, not an error', async () => {
      const cookie = await signIn('editor');
      const csrf = await csrfOf(cookie);
      expect(
        (
          await post(path, cookie, { csrf, action: 'create', name: '' })
        ).headers.get('location'),
      ).toBe(`${path}?msg=invalid`);
      expect(
        (await post(path, cookie, { csrf, action: 'explode' })).headers.get(
          'location',
        ),
      ).toBe(`${path}?msg=invalid`);
      expect(
        (
          await post(path, cookie, {
            csrf,
            action: 'rename',
            id: 'abc',
            name: 'x',
          })
        ).headers.get('location'),
      ).toBe(`${path}?msg=invalid`);
    });

    it('keeps a hostile name inert: quotes are escaped so it cannot break out of its attribute, and no script is inline', async () => {
      const cookie = await signIn('editor');
      const csrf = await csrfOf(cookie);
      await post(path, cookie, {
        csrf,
        action: 'create',
        name: '"><img src=x onerror=alert(1)>',
      });
      const html = await (await get(path, cookie)).text();
      expect(html).toContain('value="&quot;><img src=x onerror=alert(1)>"');
      expect(html).not.toContain('"><img');
      expect(html).not.toContain('<style');
      expect(html).not.toMatch(/<script(?![^>]*src=)/);
    });
  });
}
