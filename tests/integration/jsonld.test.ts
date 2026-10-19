import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

const db = env.DB;
const blocks = (html: string) =>
  [
    ...html.matchAll(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => JSON.parse(m[1]));
const tailor = async (
  o: {
    name?: string;
    consent?: boolean;
    photo?: boolean;
    published?: boolean;
  } = {},
) => {
  const slug = `jl-${unique()}`;
  const id = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, description, shop_address_text, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES (?, ?, 'Fake description', 'Rua Fake 1', 'approved', ?, ?, ?, '+67033123456')",
      )
      .bind(
        slug,
        o.name ?? 'JL Fake Tailor',
        (o.published ?? true) ? 1 : 0,
        (o.published ?? true) ? 1 : 0,
        (o.consent ?? true) ? 1 : 0,
      )
      .run()
  ).meta.last_row_id as number;
  if (o.photo) {
    const photo = (
      await db
        .prepare(
          "INSERT INTO portfolio_image (tailor_id, file_key, alt_text, permission_granted) VALUES (?, ?, 'Alt text', 1)",
        )
        .bind(id, unique().toString(16).padStart(32, '0'))
        .run()
    ).meta.last_row_id;
    await db
      .prepare('UPDATE tailor SET profile_photo_id = ? WHERE id = ?')
      .bind(photo, id)
      .run();
  }
  return slug;
};

describe('structured data (FR-PRO-07, BR-11)', () => {
  it('the home page describes the site and the organisation', async () => {
    const [site, org] = blocks(await (await get('/')).text()).flat();
    expect(site).toMatchObject({
      '@type': 'WebSite',
      url: 'https://alfaiate-tl.example/',
    });
    expect(org).toMatchObject({ '@type': 'Organization' });
  });

  it('a profile carries the public facts: name, address, consented telephone and a permitted photo', async () => {
    const slug = await tailor({ photo: true });
    const [data] = blocks(await (await get(`/tailors/${slug}`)).text());
    expect(data).toMatchObject({
      '@type': 'LocalBusiness',
      name: 'JL Fake Tailor',
      url: `https://alfaiate-tl.example/tailors/${slug}`,
      telephone: '+67033123456',
    });
    expect(data.image).toMatch(/\/media\/.+\/large\.jpg$/);
    expect(JSON.stringify(data)).not.toMatch(
      /aggregateRating|review|priceRange/,
    );
  });

  it('leaves out the telephone without consent and the image without a permitted photo', async () => {
    const slug = await tailor({ consent: false });
    const [data] = blocks(await (await get(`/tailors/${slug}`)).text());
    expect(data).not.toHaveProperty('telephone');
    expect(data).not.toHaveProperty('image');
    expect(data).not.toHaveProperty('address');
  });

  it('is in Tetum addresses too, with the Tetum page URL', async () => {
    const slug = await tailor();
    const [data] = blocks(await (await get(`/tet/tailors/${slug}`)).text());
    expect(data.url).toBe(`https://alfaiate-tl.example/tet/tailors/${slug}`);
  });

  it('is absent from pages that are not indexable or not about a published tailor', async () => {
    const draft = await tailor({ published: false });
    for (const path of [
      '/tailors',
      '/request',
      '/request/thanks?ref=AT-ABCD2345',
      '/how-it-works',
      '/privacy',
      '/no-such-page',
      `/tailors/${draft}`,
    ])
      expect(blocks(await (await get(path)).text()), path).toEqual([]);
  });

  it('keeps hostile tailor text inside one parseable block and adds no executable script', async () => {
    const slug = await tailor({ name: '</script><script>alert(1)</script>' });
    const html = await (await get(`/tailors/${slug}`)).text();
    expect(html.match(/application\/ld\+json/g)).toHaveLength(1);
    // The name also appears inside attribute values (og:title), where it is harmless text; look at the markup outside attribute values.
    const markup = html.replace(/="[^"]*"/g, '=""');
    expect(markup).not.toMatch(/<script(?![^>]*(type=""|src=""))/);
    expect(html).not.toContain('"><script>');
    expect(blocks(html)[0].name).toBe('</script><script>alert(1)</script>');
  });

  it('does not change the Content-Security-Policy: data blocks are not executed', async () => {
    const withData = (await get('/')).headers.get('content-security-policy');
    const without = (await get('/request')).headers.get(
      'content-security-policy',
    );
    expect(withData).toBe(without);
    expect(withData).toContain("script-src 'self'");
    expect(withData).not.toContain('unsafe-inline');
  });
});

describe('Open Graph tags', () => {
  const meta = (html: string, property: string) =>
    html.match(
      new RegExp(`<meta property="${property}" content="([^"]*)"`),
    )?.[1];

  it('are on indexable public pages, with the photo only when permitted', async () => {
    const withPhoto = await tailor({ photo: true });
    const html = await (await get(`/tailors/${withPhoto}`)).text();
    expect(meta(html, 'og:title')).toContain('JL Fake Tailor');
    expect(meta(html, 'og:url')).toBe(
      `https://alfaiate-tl.example/tailors/${withPhoto}`,
    );
    expect(meta(html, 'og:type')).toBe('website');
    expect(meta(html, 'og:site_name')).toBe('Alfaiate TL');
    expect(meta(html, 'og:image')).toMatch(/\/media\/.+\/large\.jpg$/);
    const without = await (await get(`/tailors/${await tailor()}`)).text();
    expect(meta(without, 'og:image')).toBeUndefined();
    expect(meta(await (await get('/')).text(), 'og:title')).toBeTruthy();
  });

  it('are not on noindex pages', async () => {
    for (const path of [
      '/request',
      '/privacy',
      '/no-such-page',
      '/tailors?category=x',
    ])
      expect(
        meta(await (await get(path)).text(), 'og:title'),
        path,
      ).toBeUndefined();
  });
});
