import { describe, expect, it } from 'vitest';
import { get } from './helpers';

// Every item in the main menu opens its own page, in both languages (no home-page anchors).
const menuHrefs = (html: string) =>
  [
    ...(/<nav class="site-nav"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '').matchAll(
      /href="([^"]+)"/g,
    ),
  ].map((m) => m[1]);

describe('the main menu', () => {
  it.each([
    ['/', ''],
    ['/tet/', '/tet'],
  ])('links only to separate pages on %s', async (path, prefix) => {
    const html = await (await get(path)).text();
    const hrefs = menuHrefs(html).filter(
      (h) => !h.endsWith('/tet/') && h !== '/' && !/^\/(tet\/?)?$/.test(h),
    );
    for (const h of hrefs) expect(h, h).not.toContain('#');
    expect(hrefs).toEqual(
      expect.arrayContaining([`${prefix}/services`, `${prefix}/craft`]),
    );
  });
  it.each([
    ['/services', 'Tailoring services'],
    ['/craft', 'Our craft'],
    ['/tet/services', 'Servisu alfaiate'],
    ['/tet/craft', 'Ami-nia ofísiu'],
  ])('%s is a real page with one heading', async (path, heading) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(heading);
  });
  it('lists the new pages in the sitemap', async () => {
    const xml = await (await get('/sitemap.xml')).text();
    expect(xml).toContain('/services');
    expect(xml).toContain('/craft');
  });
});
