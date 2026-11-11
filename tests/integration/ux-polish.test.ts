import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// UX audit 2026-11 (docs/UX-AUDIT-2026-11.md): U1 one contact block on a profile, U2 tailors first in the directory.
const addTailor = async (whatsapp: string | null, phone: string | null) => {
  const slug = `ux-${unique()}`;
  await env.DB.prepare(
    "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164, phone_e164) VALUES (?, 'Ux Fake Tailor', 'approved', 1, 1, 1, ?, ?)",
  )
    .bind(slug, whatsapp, phone)
    .run();
  return slug;
};
const block = (html: string) =>
  html.slice(
    html.indexOf('<section class="prof-contact"'),
    html.indexOf('</section>', html.indexOf('<section class="prof-contact"')),
  );
const labels = (part: string) =>
  [...part.matchAll(/<div class="button-text">([^<]+)<\/div>/g)].map(
    (m) => m[1],
  );

describe('U1 profile contact block', () => {
  it('shows WhatsApp first and filled, then Call, then a request through us, each once; the request list is a quiet text button', async () => {
    const html = await (
      await get(`/tailors/${await addTailor('+67077009001', '+67033009001')}`)
    ).text();
    const part = block(html);
    expect(labels(part)).toEqual(['WhatsApp', 'Call', 'Request this tailor']);
    expect(part).toMatch(
      /<a class="button w-inline-block" href="https:\/\/wa\.me\//,
    ); // primary: no is-shop
    expect(part).toMatch(/class="button w-inline-block is-shop" href="tel:/);
    expect(part).toContain(
      '<button type="submit" class="prof-list__button">Add to request list</button>',
    );
    expect(part).toContain('data-add-to-cart');
  });
  it('makes Call the primary action when there is no WhatsApp, and the request the primary when there is no number', async () => {
    const callOnly = block(
      await (
        await get(`/tailors/${await addTailor(null, '+67033009002')}`)
      ).text(),
    );
    expect(labels(callOnly)).toEqual(['Call', 'Request this tailor']);
    expect(callOnly).toMatch(/<a class="button w-inline-block" href="tel:/);
    const none = block(
      await (await get(`/tailors/${await addTailor(null, null)}`)).text(),
    );
    expect(labels(none)).toEqual(['Request this tailor']);
    expect(none).toMatch(
      /<a class="button w-inline-block" href="\/request\?tailor=/,
    );
  });
});

describe('U2 directory', () => {
  it('keeps the name search open, folds the other filters, and puts the note after the list', async () => {
    await addTailor('+67077009003', null);
    const html = await (await get('/tailors')).text();
    expect(html).toMatch(
      /<details class="dir-more">\s*<summary>Narrow the list<\/summary>/,
    );
    const form = html.slice(
      html.indexOf('<form class="dir-filters"'),
      html.indexOf('</form>', html.indexOf('<form class="dir-filters"')),
    );
    expect(form.indexOf('id="search-q"')).toBeLessThan(
      form.indexOf('<details'),
    );
    for (const id of ['filter-category', 'filter-area', 'name="home_visit"'])
      expect(form.indexOf(id), id).toBeGreaterThan(form.indexOf('<details'));
    expect(html.indexOf('class="shop-list dir-grid"')).toBeLessThan(
      html.indexOf('class="dir-note" role="note"'),
    );
  });
  it('opens the fold and counts the filters in force', async () => {
    const html = await (await get('/tailors?home_visit=1')).text();
    expect(html).toMatch(
      /<details class="dir-more" open>\s*<summary>Narrow the list \(1\)<\/summary>/,
    );
  });
});

describe('U5 shop', () => {
  it('has no request bar on the shop list or a product page, but keeps it elsewhere', async () => {
    for (const path of ['/shop', '/tet/shop'])
      expect(await (await get(path)).text(), path).not.toContain(
        'class="sticky-bar"',
      );
    expect(await (await get('/about')).text()).toContain('class="sticky-bar"');
  });
  it('sends a plain visit to /order back to the shop', async () => {
    const response = await get('/order');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/shop');
  });
});
