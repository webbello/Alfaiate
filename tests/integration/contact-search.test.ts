import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// Phase 7d: the Contact page and the directory search box (both reuse existing workflows; no new data is collected).
describe('contact page', () => {
  it('points at the request form in both languages and shows the join invitation only when the form is on', async () => {
    const en = await (await get('/contact')).text();
    expect(en).toMatch(/<h1>Contact us<\/h1>/);
    expect(en).toContain('href="/request"');
    expect(en).toContain('href="/join"'); // JOIN_ENABLED is true in this test project
    // no site number here, so the shop order number is the direct way to reach the business (UX audit P8)
    expect(en).toContain('https://wa.me/67077000001?text=');
    expect(en).not.toContain('We aim to contact you'); // no reply time set: no promise
    expect(/<main[\s\S]*<\/main>/.exec(en)![0]).not.toMatch(/<form/); // the footer may hold the newsletter form
    const tet = await (await get('/tet/contact')).text();
    expect(tet).toContain('<html lang="tet">');
    expect(tet).toContain('href="/tet/request"');
  });
});

describe('directory search', () => {
  it('has a labelled search box that keeps its value and filters by name', async () => {
    const slug = `search-${unique()}`;
    await env.DB.prepare(
      "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded) VALUES (?, 'Zebra Stitch Fake', 'approved', 1, 1)",
    )
      .bind(slug)
      .run();
    const html = await (await get('/tailors?q=zebra')).text();
    expect(html).toMatch(/<label for="search-q">/);
    expect(html).toMatch(/<input[^>]*id="search-q"[^>]*value="zebra"/);
    expect(html).toContain(`href="/tailors/${slug}"`);
    expect(html).toContain('name="robots" content="noindex,follow"');
    const none = await (await get('/tailors?q=nothing-matches-this')).text();
    expect(none).not.toContain(`href="/tailors/${slug}"`);
  });
});
