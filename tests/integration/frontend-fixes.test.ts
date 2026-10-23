import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// Frontend review, five fixes: one name for the request action, each place once on a card, a named price per work type,
// a phone bar that is the tailor's own contact on a profile, and "Details" over the facts that are not about home visits.
const db = env.DB;
const run = (sql: string, ...args: (string | number | null)[]) =>
  db
    .prepare(sql)
    .bind(...args)
    .run();

async function seed(opts: { whatsapp: string | null; phone: string | null }) {
  const n = unique();
  const slug = `ff-${n}`;
  const id = (
    await run(
      "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164, phone_e164, languages, home_visits) VALUES (?, ?, 'approved', 1, 1, 1, ?, ?, 'Tetum', 'yes')",
      slug,
      `Ff Tailor ${n}`,
      opts.whatsapp,
      opts.phone,
    )
  ).meta.last_row_id;
  const cheap = (
    await run(
      'INSERT INTO garment_category (slug, name, sort_order) VALUES (?, ?, 1)',
      `ffc-a-${n}`,
      `Ff Alterations ${n}`,
    )
  ).meta.last_row_id;
  const suits = (
    await run(
      'INSERT INTO garment_category (slug, name, sort_order) VALUES (?, ?, 2)',
      `ffc-b-${n}`,
      `Ff Suits ${n}`,
    )
  ).meta.last_row_id;
  // the first work type has no price; the second does: the card must name the second
  await run(
    'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
    id,
    cheap,
  );
  await run(
    'INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to) VALUES (?, ?, 12000, 35000)',
    id,
    suits,
  );
  const area = (
    await run(
      'INSERT INTO service_area (slug, name) VALUES (?, ?)',
      `ffa-${n}`,
      `Ff Comoro ${n}`,
    )
  ).meta.last_row_id;
  // the same place as shop and as a service area
  await run(
    "INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, 'shop_location')",
    id,
    area,
  );
  await run(
    "INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, 'serves')",
    id,
    area,
  );
  return { n, slug };
}

describe('the five frontend fixes', () => {
  it('calls the request action "Request a Tailor" in the header, hero, bar and directory, in both languages', async () => {
    for (const [path, label] of [
      ['/', 'Request a Tailor'],
      ['/tailors', 'Request a Tailor'],
      ['/tet/', 'Husu Alfaiate'],
    ] as const) {
      const html = await (await get(path)).text();
      expect(html, path).toContain(label);
      expect(html, path).not.toContain('Ask for a tailor');
      expect(html, path).not.toContain('Request a Tailor at Home');
    }
  });

  it('lists each place once on a card, and names the work type the price belongs to', async () => {
    const { n } = await seed({ whatsapp: '+67077123456', phone: null });
    const html = await (await get('/tailors')).text();
    const card =
      html.match(
        new RegExp(
          `<li data-directory-item[^>]*>(?:(?!</li>)[\\s\\S])*Ff Tailor ${n}[\\s\\S]*?</li>`,
        ),
      )?.[0] ?? '';
    expect(card).toContain(`Ff Suits ${n} (approximate): $120 – $350`);
    expect(card).not.toContain('Approximate prices');
    const places = card.match(new RegExp(`Ff Comoro ${n}`, 'g')) ?? [];
    expect(places).toHaveLength(1);
  });

  it("makes the phone bar on a profile the tailor's own WhatsApp (counted as a tap) with a request link", async () => {
    const { slug } = await seed({
      whatsapp: '+67077123456',
      phone: '+67033123456',
    });
    const html = await (await get(`/tailors/${slug}`)).text();
    const bar = /<nav class="sticky-bar"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
    expect(bar).toContain('wa.me/67077123456');
    expect(bar).toContain(`data-contact-channel="whatsapp"`);
    expect(bar).toContain(`data-tailor="${slug}"`);
    expect(bar).toContain(`href="/request?tailor=${slug}"`);
    expect(bar).not.toContain('Request a Tailor');
    expect(html).toContain('Details</h2>');
  });

  it('falls back to Call when there is no WhatsApp, and to the general bar when the tailor shows no contact', async () => {
    const callOnly = await seed({ whatsapp: null, phone: '+67033123456' });
    const bar =
      /<nav class="sticky-bar"[\s\S]*?<\/nav>/.exec(
        await (await get(`/tailors/${callOnly.slug}`)).text(),
      )?.[0] ?? '';
    expect(bar).toContain('data-contact-channel="phone"');
    expect(bar).toContain('href="tel:');
    const none = await seed({ whatsapp: null, phone: null });
    const general =
      /<nav class="sticky-bar"[\s\S]*?<\/nav>/.exec(
        await (await get(`/tailors/${none.slug}`)).text(),
      )?.[0] ?? '';
    expect(general).toContain('Request a Tailor');
    expect(general).not.toContain('data-contact-channel');
  });
});

describe('the medium-priority polish', () => {
  it('puts a WhatsApp button on a directory card only when the tailor shows one, and loads the tap counter then', async () => {
    const withWa = await seed({ whatsapp: '+67077123456', phone: null });
    const without = await seed({ whatsapp: null, phone: '+67033123456' });
    const html = await (await get('/tailors')).text();
    const card = (n: number) =>
      html.match(
        new RegExp(
          `<li data-directory-item[^>]*>(?:(?!</li>)[\\s\\S])*Ff Tailor ${n}[\\s\\S]*?</li>`,
        ),
      )?.[0] ?? '';
    expect(card(withWa.n)).toContain('class="shop-whatsapp"');
    expect(card(withWa.n)).toContain('wa.me/67077123456');
    expect(card(withWa.n)).toContain(`data-tailor="${withWa.slug}"`);
    expect(card(withWa.n)).toContain(
      `aria-label="WhatsApp Ff Tailor ${withWa.n}"`,
    );
    expect(card(without.n)).not.toContain('shop-whatsapp');
    expect(html).toMatch(/<script[^>]*\bsrc="[^"]+"/);
  });

  it('turns the area on the request form into one labelled drop-down list', async () => {
    const html = await (await get('/request')).text();
    expect(html).toMatch(/<label for="area-select">/);
    expect(html).toMatch(/<select id="area-select" name="area"/);
    expect(html).not.toContain('id="area-none"');
  });

  it('shows the language switch as EN and TET with the current one marked, and names both languages for screen readers', async () => {
    const en = await (await get('/')).text();
    expect(en).toContain('role="group" aria-label="Language"');
    expect(en).toMatch(
      /<span aria-current="true" lang="en">EN<\/span><a href="\/tet\/"[^>]*aria-label="Tetun">TET<\/a>/,
    );
    const tet = await (await get('/tet/')).text();
    expect(tet).toMatch(
      /<span aria-current="true" lang="tet">TET<\/span><a href="\/"[^>]*aria-label="English">EN<\/a>/,
    );
  });

  it('shows the disclaimer in the slim style on a profile', async () => {
    const { slug } = await seed({ whatsapp: '+67077123456', phone: null });
    const html = await (await get(`/tailors/${slug}`)).text();
    expect(html).toContain('<p class="dir-note" role="note">');
  });
});
