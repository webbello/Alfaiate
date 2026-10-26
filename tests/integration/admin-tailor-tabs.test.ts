import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';

// The tailor page shows one section at a time (five tabs, no script). Every form is still on the page, each in its tab; the publish checklist sits above the tabs.
describe('tabs on the tailor page', () => {
  it('has five panels holding the same forms as before, and the checklist above them', async () => {
    const n = unique();
    const id = (
      await env.DB.prepare(
        'INSERT INTO tailor (slug, display_name) VALUES (?, ?)',
      )
        .bind(`tabs-${n}`, `Tabs Fake ${n}`)
        .run()
    ).meta.last_row_id;
    const html = await (
      await get(`/admin/tailors/${id}`, await signIn('owner'))
    ).text();
    const panel = (key: string) =>
      new RegExp(
        `<div class="tabs__panel" id="tab-${key}">([\\s\\S]*?)(?=<div class="tabs__panel" id="tab-|</main>)`,
      ).exec(html)?.[1] ?? '';
    const [details, work, photos, publish, more] = [
      'details',
      'work',
      'photos',
      'publish',
      'more',
    ].map(panel);
    expect(details).toContain('value="save_profile"');
    expect(details).toContain('name="display_name"');
    expect(work).toContain('value="save_categories"');
    expect(work).toContain('value="save_areas"');
    expect(photos).toContain('Photos');
    expect(publish).toContain('value="record_permission"');
    expect(publish).toContain('value="set_verified"');
    expect(more).toContain('value="add_note"');
    expect(more).toContain('Tailor sign-in');
    expect(more).toContain('Shop orders');
    // the nav lists the five tabs, and the checklist is not inside a tab
    for (const key of ['details', 'work', 'photos', 'publish', 'more'])
      expect(html).toContain(`href="#tab-${key}"`);
    expect(html.indexOf('id="checklist"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="checklist"')).toBeLessThan(
      html.indexOf('class="tabs__nav"'),
    );
    // owner-only fee form is in the last tab
    expect(more).toContain('/fees');
  });

  it('remembers the tab a save came from in a short cookie, cleared when read, and ignores a bad value', async () => {
    const owner = await signIn('owner');
    const n = unique();
    const id = (
      await env.DB.prepare(
        'INSERT INTO tailor (slug, display_name) VALUES (?, ?)',
      )
        .bind(`tabs2-${n}`, `Tabs Two ${n}`)
        .run()
    ).meta.last_row_id;
    const withCookie = async (value: string) => {
      const response = await get(
        `/admin/tailors/${id}`,
        `${owner}; __Host-admin_tab=${value}`,
      );
      return {
        html: await response.text(),
        cleared: response.headers.get('set-cookie') ?? '',
      };
    };
    const photos = await withCookie('photos');
    expect(photos.html).toContain('data-open="photos"');
    expect(photos.cleared).toMatch(
      /__Host-admin_tab=;|__Host-admin_tab=deleted|Max-Age=0|Expires=Thu, 01 Jan 1970/i,
    );
    const bad = await withCookie('evil"><script>');
    expect(bad.html).not.toContain('data-open=');
    expect(bad.html).not.toContain('<script>');
  });
});
