import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

const db = env.DB;
type Seed = {
  name?: string;
  published?: boolean;
  consent?: boolean;
  whatsapp?: string | null;
  phone?: string | null;
  description?: string | null;
  address?: string | null;
  languages?: string | null;
  home?: 'yes' | 'no' | 'unknown';
  priceNote?: string | null;
  verified?: string[];
};
async function tailor(o: Seed = {}) {
  const slug = `pf-${unique()}`;
  const published = o.published ?? true;
  const id = (
    await db
      .prepare(
        `INSERT INTO tailor (slug, display_name, description, shop_address_text, home_visits, languages, price_note, whatsapp_e164, phone_e164, status, is_published,
                             permission_recorded, contact_publish_consent, verified_fields)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        slug,
        o.name ?? `Pf Tailor ${slug}`,
        o.description ?? null,
        o.address ?? null,
        o.home ?? 'unknown',
        o.languages ?? null,
        o.priceNote ?? null,
        o.whatsapp === undefined ? '+67077123456' : o.whatsapp,
        o.phone === undefined ? '+67033123456' : o.phone,
        published ? 'approved' : 'draft',
        published ? 1 : 0,
        published ? 1 : 0,
        (o.consent ?? true) ? 1 : 0,
        JSON.stringify(o.verified ?? []),
      )
      .run()
  ).meta.last_row_id;
  return { id, slug };
}
const category = async (name: string) => {
  const slug = `pc-${unique()}`;
  return {
    id: (
      await db
        .prepare('INSERT INTO garment_category (slug, name) VALUES (?, ?)')
        .bind(slug, name)
        .run()
    ).meta.last_row_id,
    slug,
  };
};
const area = async (name: string) =>
  (
    await db
      .prepare('INSERT INTO service_area (slug, name) VALUES (?, ?)')
      .bind(`pa-${unique()}`, name)
      .run()
  ).meta.last_row_id;
const photo = async (
  tailorId: number,
  alt: string,
  permission = 1,
  visible = 1,
  caption: string | null = null,
) => {
  const key = unique().toString(16).padStart(32, '0');
  const id = (
    await db
      .prepare(
        'INSERT INTO portfolio_image (tailor_id, file_key, alt_text, caption, permission_granted, is_visible) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(tailorId, key, alt, caption, permission, visible)
      .run()
  ).meta.last_row_id;
  return { id, key };
};
const page = async (path: string) => {
  const response = await get(path);
  return { status: response.status, html: await response.text() };
};
const sections = (html: string) =>
  [...html.matchAll(/<h2 id="([a-z]+)"/g)].map((m) => m[1]);

describe('profile page (AC-03, FR-PRO-01/02/03/05/08)', () => {
  it('renders only the sections that have data: a bare profile has just contact and the notes', async () => {
    const { slug } = await tailor({
      name: 'Pf Bare Fake',
      whatsapp: null,
      phone: null,
    });
    const { status, html } = await page(`/tailors/${slug}`);
    expect(status).toBe(200);
    expect(html).toContain('<h1>Pf Bare Fake</h1>');
    expect(sections(html)).toEqual(['contact']);
    for (const empty of [
      'Their work',
      'Prices',
      'What they make',
      'Where',
      'Languages',
      'About',
      'Shop address',
    ])
      expect(html, empty).not.toContain(empty);
  });

  it('shows prices as approximate with their date and unit, a range, and who they come from', async () => {
    const t = await tailor({ name: 'Pf Prices Fake' });
    const [suit, shirt] = [
      await category('Pf Suit Fake'),
      await category('Pf Shirt Fake'),
    ];
    await db
      .prepare(
        "INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to, price_unit_note, price_source, price_confirmed_on) VALUES (?, ?, 6000, 9500, 'per suit', 'verified', '2026-09-01')",
      )
      .bind(t.id, suit.id)
      .run();
    await db
      .prepare(
        'INSERT INTO tailor_category (tailor_id, category_id, price_from) VALUES (?, ?, 1500)',
      )
      .bind(t.id, shirt.id)
      .run();
    const { html } = await page(`/tailors/${t.slug}`);
    expect(html).toContain('Approximate prices: $60 – $95 (per suit)');
    expect(html).toContain('Confirmed 2026-09-01');
    expect(html).toContain('Approximate prices: From $15');
    const item = (name: string) =>
      [...html.matchAll(/<li>.*?<\/li>/gs)]
        .map((m) => m[0])
        .find((li) => li.includes(name))!;
    expect(item('Pf Suit Fake')).toContain('Verified by Alfaiate TL');
    expect(item('Pf Shirt Fake')).toContain('Supplied by the tailor');
    expect(item('Pf Shirt Fake')).not.toContain('Verified by Alfaiate TL');
  });

  it('labels each fact verified or supplied, and hides unverified languages (BR-11)', async () => {
    const { slug } = await tailor({
      description: 'Pf desc words',
      languages: 'Pf Tetum',
      home: 'yes',
      verified: ['description', 'home_visits'],
    });
    const { html } = await page(`/tailors/${slug}`);
    const about = html.slice(
      html.indexOf('id="about"'),
      html.indexOf('</section>', html.indexOf('id="about"')),
    );
    expect(about).toContain('Verified by Alfaiate TL');
    const details = html.slice(html.indexOf('id="details"'));
    expect(details).toContain('Offers home visits');
    expect(details.slice(0, details.indexOf('</dl>'))).toContain(
      'Verified by Alfaiate TL',
    );
    expect(html).not.toContain('Pf Tetum'); // languages are public only when verified
    const verifiedLanguages = await tailor({
      languages: 'Pf Portuguese',
      verified: ['languages'],
    });
    expect((await page(`/tailors/${verifiedLanguages.slug}`)).html).toContain(
      'Pf Portuguese',
    );
  });

  it('labels an unverified description as supplied by the tailor, not verified', async () => {
    const { slug } = await tailor({
      description: 'Pf unverified words',
      verified: [],
    });
    const { html } = await page(`/tailors/${slug}`);
    const about = html.slice(
      html.indexOf('id="about"'),
      html.indexOf('</section>', html.indexOf('id="about"')),
    );
    expect(about).toContain('Supplied by the tailor');
    expect(about).not.toContain('Verified by Alfaiate TL');
  });

  it('never shows unknown home visits as an answer, and never claims ratings, reviews or awards', async () => {
    const { slug } = await tailor({
      home: 'unknown',
      description: 'Plain words',
    });
    const { html } = await page(`/tailors/${slug}`);
    expect(html).not.toContain('Offers home visits');
    expect(html).not.toContain('Does not offer home visits');
    for (const claim of [
      /rating/i,
      /review/i,
      /\bstars?\b/i,
      /award/i,
      /certified/i,
      /best tailor/i,
      /guarantee[sd]? (quality|delivery)/i,
    ])
      expect(html).not.toMatch(claim);
  });

  it('shows only permitted, visible photos, with alt text, captions and responsive sources', async () => {
    const t = await tailor();
    const shown = await photo(t.id, 'Pf Shown Alt', 1, 1, 'Pf shown caption');
    await photo(t.id, 'Pf Unpermitted Alt', 0, 1);
    await photo(t.id, 'Pf Hidden Alt', 1, 0);
    const { html } = await page(`/tailors/${t.slug}`);
    expect(html).toContain('alt="Pf Shown Alt"');
    expect(html).toContain('Pf shown caption');
    expect(html).toContain(
      `/media/tailor/${t.id}/${shown.key}/large.jpg 1600w`,
    );
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('Pf Unpermitted Alt');
    expect(html).not.toContain('Pf Hidden Alt');
    expect(html).toContain('Their work');
  });

  it('uses the profile photo as the lead picture only while it is permitted and visible', async () => {
    const t = await tailor();
    const p = await photo(t.id, 'Pf Lead Alt');
    await db
      .prepare('UPDATE tailor SET profile_photo_id = ? WHERE id = ?')
      .bind(p.id, t.id)
      .run();
    expect((await page(`/tailors/${t.slug}`)).html).toContain(
      'class="profile__photo"',
    );
    await db
      .prepare('UPDATE portfolio_image SET permission_granted = 0 WHERE id = ?')
      .bind(p.id)
      .run();
    expect((await page(`/tailors/${t.slug}`)).html).not.toContain(
      'class="profile__photo"',
    );
  });

  it('has a title, a description from the tailor text, a canonical address and the request button for this tailor', async () => {
    const { slug } = await tailor({
      name: 'Pf Meta Fake',
      description: 'Pf meta description words',
    });
    const { html } = await page(`/tailors/${slug}`);
    expect(html).toContain('<title>Pf Meta Fake · Alfaiate TL</title>');
    expect(html).toContain(
      '<meta name="description" content="Pf meta description words"',
    );
    expect(html).toContain(
      `<link rel="canonical" href="https://alfaiate-tl.example/tailors/${slug}"`,
    );
    expect(html).toContain(
      `hreflang="tet" href="https://alfaiate-tl.example/tet/tailors/${slug}"`,
    );
    expect(html).toContain(`href="/request?tailor=${slug}"`);
    expect(html).toContain('introduces you to independent tailors');
  });
});

describe('contact links (AC-04, FR-PRO-04)', () => {
  it('gives WhatsApp and Call their own links, with the exact forms and a prefilled message naming the listing', async () => {
    const { slug } = await tailor({ name: 'Pf Contact Fake' });
    const { html } = await page(`/tailors/${slug}`);
    const wa = html.match(
      /href="(https:\/\/wa\.me\/67077123456\?text=[^"]+)"/,
    )?.[1];
    expect(wa).toBeTruthy();
    expect(
      decodeURIComponent(wa!.split('?text=')[1].replace(/&amp;/g, '&')),
    ).toBe(
      'Hello, I found Pf Contact Fake on Alfaiate TL and would like to ask about your tailoring.',
    );
    expect(html).toContain('href="tel:+67033123456"');
    expect(html).toContain(
      `data-contact-channel="whatsapp" data-tailor="${slug}"`,
    );
    expect(html).toContain(
      `data-contact-channel="phone" data-tailor="${slug}"`,
    );
  });

  it('shows each button only when that number exists', async () => {
    const onlyPhone = (
      await page(`/tailors/${(await tailor({ whatsapp: null })).slug}`)
    ).html;
    expect(onlyPhone).not.toContain('wa.me');
    expect(onlyPhone).not.toContain('data-contact-channel="whatsapp"');
    expect(onlyPhone).toContain('href="tel:');
    const onlyWhatsapp = (
      await page(`/tailors/${(await tailor({ phone: null })).slug}`)
    ).html;
    expect(onlyWhatsapp).toContain('wa.me');
    expect(onlyWhatsapp).not.toContain('href="tel:');
    expect(onlyWhatsapp).not.toContain('data-contact-channel="phone"');
  });

  it('shows no number, no link and no address without the tailor’s consent (PRV-06)', async () => {
    const { slug } = await tailor({
      consent: false,
      address: 'Rua Pf Secret 9',
    });
    const { html } = await page(`/tailors/${slug}`);
    expect(html).not.toContain('wa.me');
    expect(html).not.toContain('tel:');
    expect(html).not.toContain('67077123456');
    expect(html).not.toContain('67033123456');
    expect(html).not.toContain('Rua Pf Secret 9');
  });

  it('writes the Tetum message in Tetum', async () => {
    const { slug } = await tailor({ name: 'Pf Tetum Contact Fake' });
    const { html } = await page(`/tet/tailors/${slug}`);
    const wa = html.match(/href="(https:\/\/wa\.me\/[^"]+)"/)?.[1];
    expect(
      decodeURIComponent(wa!.split('?text=')[1].replace(/&amp;/g, '&')),
    ).toContain('Pf Tetum Contact Fake');
    expect(decodeURIComponent(wa!.split('?text=')[1])).toContain('Bondia');
  });
});

describe('who gets a profile page (AC-05, FR-PRO-06)', () => {
  it('answers 404 with the site 404 page for draft, unpublished, unknown and malformed addresses', async () => {
    const draft = await tailor({ published: false });
    for (const path of [
      `/tailors/${draft.slug}`,
      '/tailors/no-such-tailor',
      '/tailors/%3Cscript%3E',
      '/tailors/Has%20Space',
      `/tailors/${'a'.repeat(400)}`,
      `/tet/tailors/${draft.slug}`,
    ]) {
      const { status, html } = await page(path);
      expect(status, path).toBe(404);
      expect(html, path).toMatch(/We could not find that page|Ami la hetan/);
      expect(html, path).toContain('name="robots" content="noindex,follow"');
      expect(html, path).not.toContain('Pf Tailor');
    }
  });

  it('stops serving a tailor the moment it is unpublished', async () => {
    const { id, slug } = await tailor();
    expect((await page(`/tailors/${slug}`)).status).toBe(200);
    await db
      .prepare('UPDATE tailor SET is_published = 0 WHERE id = ?')
      .bind(id)
      .run();
    expect((await page(`/tailors/${slug}`)).status).toBe(404);
  });
});

describe('hostile content stays inert, in both languages', () => {
  it('escapes names, descriptions, captions, alt text and notes', async () => {
    const t = await tailor({
      name: '"><img src=x onerror=alert(1)>',
      description: '<script>alert(1)</script>',
      address: '<b>x</b>',
      priceNote: '</p><script>x</script>',
    });
    await photo(t.id, '"><svg onload=alert(1)>', 1, 1, '<i>caption</i>');
    for (const prefix of ['', '/tet']) {
      const { html } = await page(`${prefix}/tailors/${t.slug}`);
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('<script>alert');
      // Inside a quoted attribute a "<" is harmless; what matters is that the quote is escaped so nothing can break out.
      expect(html).not.toMatch(/alt=""[^"]*<svg/);
      expect(html).toContain('alt="&quot;');
      expect(html).toContain('&lt;i&gt;caption&lt;/i&gt;');
      expect(html).not.toContain('<b>x</b>');
      expect(html).not.toContain('<i>caption</i>');
      expect(html).not.toMatch(/<script(?![^>]*src=)/);
      expect(html).not.toContain('<style');
    }
  });
});

describe('Tetum profile', () => {
  it('has Tetum labels and links, and a link back to the English page', async () => {
    const t = await tailor({
      name: 'Pf Tetum Page Fake',
      description: 'Words',
      home: 'yes',
      verified: ['description'],
    });
    await db
      .prepare(
        'INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, ?)',
      )
      .bind(t.id, await area('Pf Tetum Area Fake'), 'serves')
      .run();
    const { status, html } = await page(`/tet/tailors/${t.slug}`);
    expect(status).toBe(200);
    expect(html).toContain('<html lang="tet">');
    expect(html).toContain('Verifika husi Alfaiate TL');
    expect(html).toContain('Fila ba alfaiate hotu-hotu');
    expect(html).toContain('href="/tet/tailors"');
    expect(html).toContain(`href="/tailors/${t.slug}" lang="en"`);
    expect(html).toContain(`href="/tet/request?tailor=${t.slug}"`);
  });
});
