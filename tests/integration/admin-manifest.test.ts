import { describe, expect, it } from 'vitest';
import { get, signIn } from './helpers';

// FR-ADM-19: the admin can be added to a phone's home screen as "Alfaiate Admin": a manifest scoped to /admin, icons, no service worker, and nothing on the public site.
describe('add to home screen', () => {
  it('serves a manifest named Alfaiate Admin, scoped to /admin, with icons that exist', async () => {
    const response = await get('/admin.webmanifest');
    expect(response.status).toBe(200);
    const manifest = (await response.json()) as {
      name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: { src: string; sizes: string; type: string }[];
    };
    expect(manifest.name).toBe('Alfaiate Admin');
    expect(manifest.display).toBe('standalone');
    expect(manifest.scope).toBe('/admin');
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    expect(manifest.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512']);
    for (const icon of [
      ...manifest.icons,
      { src: '/admin-icon-180.png', type: 'image/png' },
    ]) {
      const r = await get(icon.src);
      expect(r.status, icon.src).toBe(200);
      expect(r.headers.get('content-type'), icon.src).toContain('image/png');
    }
  });

  it('is linked from admin pages (sign-in and signed in) and never from the public site or the tailor portal', async () => {
    const owner = await signIn('owner');
    for (const html of [
      await (await get('/admin/login')).text(),
      await (await get('/admin', owner)).text(),
    ]) {
      expect(html).toContain('<link rel="manifest" href="/admin.webmanifest">');
      expect(html).toContain(
        '<link rel="apple-touch-icon" href="/admin-icon-180.png">',
      );
      expect(html).toContain(
        'apple-mobile-web-app-title" content="Alfaiate Admin"',
      );
      expect(html).not.toMatch(/serviceWorker|service-worker/);
    }
    for (const path of ['/', '/request', '/tailors', '/portal/login'])
      expect(await (await get(path)).text(), path).not.toContain(
        'admin.webmanifest',
      );
  });
});
