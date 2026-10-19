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
    // Phase 7d: the owner's reference copy replaced "Find a tailor in Dili" and "Request a tailor at home" (FR-PUB-03 label, decision logged).
    const h1 = index(
      html,
      '<h1 id="hero-heading">Find the Tailor Who Gets <span class="accent">Your Style.</span>',
    );
    const disclaimer = index(html, 'introduces you to independent tailors');
    const cta = index(html, 'class="button button--ghost" href="/request"');
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
    const h1 = index(
      html,
      '<h1 id="hero-heading">Buka Alfaiate ne’ebé Komprende',
    );
    const disclaimer = index(html, 'aprezenta ita ba alfaiate independente');
    const cta = index(html, 'class="button button--ghost" href="/tet/request"');
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

  it('links a service card to its category page once a published tailor offers it, and to the directory before that', async () => {
    const custom =
      (
        await env.DB.prepare(
          "INSERT OR IGNORE INTO garment_category (slug, name) VALUES ('custom-clothing', 'Custom Fake') RETURNING id",
        ).first<{ id: number }>()
      )?.id ??
      (await env.DB.prepare(
        "SELECT id FROM garment_category WHERE slug = 'custom-clothing'",
      ).first<{ id: number }>())!.id;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO garment_category (slug, name) VALUES ('wedding', 'Wedding Fake')",
    ).run();
    const live = (
      await env.DB.prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded) VALUES (?, 'Home Live Fake', 'approved', 1, 1)",
      )
        .bind(`hl-${unique()}`)
        .run()
    ).meta.last_row_id;
    await env.DB.prepare(
      'INSERT OR IGNORE INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
    )
      .bind(live, custom)
      .run();
    const { html } = await text('/');
    const card = (label: string) =>
      new RegExp(
        `<a class="service-card reveal" href="([^"]+)">(?:(?!</a>)[\\s\\S])*?${label}`,
      ).exec(html)?.[1];
    expect(card('Custom Clothing')).toBe('/categories/custom-clothing');
    expect(card('Wedding and Special Occasions')).toBe('/tailors');
    expect(html.match(/class="service-card reveal"/g)).toHaveLength(8);
    const tet = (await text('/tet/')).html;
    expect(tet).toContain('href="/tet/categories/custom-clothing"');
  });

  it('has no inline script or style and keeps the security headers', async () => {
    const { html, headers } = await text('/');
    expect(html).not.toContain('<style');
    expect(html).not.toMatch(
      /<script(?![^>]*(src=|type="application\/ld\+json"))/,
    );
    expect(headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    );
    expect(headers.get('set-cookie')).toBeNull();
  });
});
