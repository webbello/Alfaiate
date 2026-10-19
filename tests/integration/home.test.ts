import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

const text = async (path: string) => {
  const response = await get(path);
  return {
    status: response.status,
    html: await response.text(),
    headers: response.headers,
  };
};
const index = (html: string, needle: string) => {
  const i = html.indexOf(needle);
  expect(i, needle).toBeGreaterThan(-1);
  return i;
};

describe('home page (AC-01, FR-PUB-01/02/03)', () => {
  it('shows the explanation, the disclaimer and the request button before anything else, in English', async () => {
    const { status, html } = await text('/');
    expect(status).toBe(200);
    expect(html).toContain('<html lang="en">');
    const h1 = index(html, '<h1>Find a tailor in Dili</h1>');
    const disclaimer = index(html, 'introduces you to independent tailors');
    const cta = index(html, 'Request a tailor at home');
    const how = index(html, '<h2 id="how">');
    // The first content block: heading, disclaimer and request button all come before "How it works" and the rest.
    expect(h1).toBeLessThan(disclaimer);
    expect(disclaimer).toBeLessThan(how);
    expect(cta).toBeLessThan(how);
    expect(html).toContain('href="/request"');
    expect(html).toContain('href="/tailors"');
  });

  it('does the same in Tetum, with Tetum links', async () => {
    const { status, html } = await text('/tet/');
    expect(status).toBe(200);
    expect(html).toContain('<html lang="tet">');
    const h1 = index(html, '<h1>Buka alfaiate iha Dili</h1>');
    const disclaimer = index(html, 'aprezenta ita ba alfaiate independente');
    const cta = index(html, 'Husu alfaiate ba uma');
    const how = index(html, '<h2 id="how">');
    expect(h1).toBeLessThan(disclaimer);
    expect(disclaimer).toBeLessThan(how);
    expect(cta).toBeLessThan(how);
    expect(html).toContain('href="/tet/request"');
    expect(html).toContain('href="/tet/tailors"');
  });

  it('never promises availability, quality or timing (BR-04)', async () => {
    const { html } = await text('/');
    expect(html).toContain('cannot guarantee');
    for (const claim of [
      /best tailor/i,
      /guarantee[sd]? (quality|delivery)/i,
      /same.day/i,
      /top.rated/i,
      /\d+\s*stars?/i,
    ])
      expect(html).not.toMatch(claim);
  });

  it('links to the language twin and declares alternates and a canonical address', async () => {
    const en = (await text('/')).html;
    expect(en).toContain(
      '<link rel="canonical" href="https://alfaiate-tl.example/"',
    );
    expect(en).toContain(
      'hreflang="tet" href="https://alfaiate-tl.example/tet/"',
    );
    expect(en).toContain(
      'hreflang="x-default" href="https://alfaiate-tl.example/"',
    );
    expect(en).toMatch(
      /<a class="lang-switch" href="\/tet\/" lang="tet" hreflang="tet">\s*Tetun/,
    );
    const tet = (await text('/tet/')).html;
    expect(tet).toContain(
      '<link rel="canonical" href="https://alfaiate-tl.example/tet/"',
    );
    expect(tet).toMatch(
      /<a class="lang-switch" href="\/" lang="en" hreflang="en">\s*English/,
    );
  });

  it('lists only categories that have a published tailor, linking to their pages', async () => {
    const withTailor = (
      await env.DB.prepare(
        "INSERT INTO garment_category (slug, name) VALUES (?, 'Home Cat Used Fake')",
      )
        .bind(`hc-${unique()}`)
        .run()
    ).meta.last_row_id;
    const empty = (
      await env.DB.prepare(
        "INSERT INTO garment_category (slug, name) VALUES (?, 'Home Cat Empty Fake')",
      )
        .bind(`hc-${unique()}`)
        .run()
    ).meta.last_row_id;
    const draftOnly = (
      await env.DB.prepare(
        "INSERT INTO garment_category (slug, name) VALUES (?, 'Home Cat Draft Fake')",
      )
        .bind(`hc-${unique()}`)
        .run()
    ).meta.last_row_id;
    const live = (
      await env.DB.prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded) VALUES (?, 'Home Live Fake', 'approved', 1, 1)",
      )
        .bind(`hl-${unique()}`)
        .run()
    ).meta.last_row_id;
    const draft = (
      await env.DB.prepare(
        "INSERT INTO tailor (slug, display_name) VALUES (?, 'Home Draft Fake')",
      )
        .bind(`hd-${unique()}`)
        .run()
    ).meta.last_row_id;
    await env.DB.prepare(
      'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?), (?, ?)',
    )
      .bind(live, withTailor, draft, draftOnly)
      .run();
    void empty;
    const { html } = await text('/');
    expect(html).toContain('Home Cat Used Fake');
    expect(html).not.toContain('Home Cat Empty Fake');
    expect(html).not.toContain('Home Cat Draft Fake');
    const slug = (await env.DB.prepare(
      'SELECT slug FROM garment_category WHERE id = ?',
    )
      .bind(withTailor)
      .first<{ slug: string }>())!.slug;
    expect(html).toContain(`href="/categories/${slug}"`);
    expect((await text('/tet/')).html).toContain(
      `href="/tet/categories/${slug}"`,
    );
  });

  it('has no inline script or style and keeps the security headers', async () => {
    const { html, headers } = await text('/');
    expect(html).not.toContain('<style');
    expect(html).not.toMatch(/<script(?![^>]*src=)/);
    expect(headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    );
    expect(headers.get('set-cookie')).toBeNull();
  });
});

describe('request placeholder (until Phase 5)', () => {
  for (const [path, lang, browse] of [
    ['/request', 'en', 'href="/tailors"'],
    ['/tet/request', 'tet', 'href="/tet/tailors"'],
  ] as const) {
    it(`${path} explains the form is not open, has no form, and is not indexed`, async () => {
      const { status, html } = await text(path);
      expect(status).toBe(200);
      expect(html).toContain(`<html lang="${lang}">`);
      expect(html).not.toMatch(/<form|<input|<textarea|<select/);
      expect(html).toContain('name="robots" content="noindex,follow"');
      expect(html).toContain(browse);
    });
  }
});
