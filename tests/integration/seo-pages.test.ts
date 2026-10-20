import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// Phase 8 prep (search discovery): keyword titles, area pages, FAQ, thin pages kept out of search, sitemap entries.
const db = env.DB;
const make = async (published = true) => {
  const area = `sa-${unique()}`;
  const cat = `sc-${unique()}`;
  const a = (
    await db
      .prepare(
        "INSERT INTO service_area (slug, name) VALUES (?, 'Seo Area Fake')",
      )
      .bind(area)
      .run()
  ).meta.last_row_id;
  const c = (
    await db
      .prepare(
        "INSERT INTO garment_category (slug, name) VALUES (?, 'Seo Cat Fake')",
      )
      .bind(cat)
      .run()
  ).meta.last_row_id;
  if (published) {
    const t = (
      await db
        .prepare(
          "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded) VALUES (?, 'Seo Tailor Fake', 'approved', 1, 1)",
        )
        .bind(`st-${unique()}`)
        .run()
    ).meta.last_row_id;
    await db
      .prepare(
        'INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, ?)',
      )
      .bind(t, a, 'serves')
      .run();
    await db
      .prepare(
        'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
      )
      .bind(t, c)
      .run();
  }
  return { area, cat };
};
const title = (html: string) => /<title>([^<]*)<\/title>/.exec(html)![1];

describe('search-friendly titles', () => {
  it('names the place and the service on the home page, the directory and listings, in both languages', async () => {
    expect(title(await (await get('/')).text())).toMatch(
      /Tailors in Dili, Timor-Leste.*custom clothing/i,
    );
    expect(title(await (await get('/tailors')).text())).toMatch(
      /tailor in Dili and Timor-Leste/i,
    );
    expect(title(await (await get('/tet/')).text())).toMatch(
      /Alfaiate iha Dili, Timor-Leste/,
    );
    const { area, cat } = await make();
    expect(title(await (await get(`/areas/${area}`)).text())).toBe(
      'Tailors in Seo Area Fake, Timor-Leste · Alfaiate TL',
    );
    expect(title(await (await get(`/categories/${cat}`)).text())).toBe(
      'Seo Cat Fake tailors in Timor-Leste · Alfaiate TL',
    );
  });
});

describe('area pages', () => {
  it('list published tailors of the area, carry the FAQ and a canonical address, and are in the sitemap', async () => {
    const { area } = await make();
    const html = await (await get(`/areas/${area}`)).text();
    expect(html).toContain('Seo Tailor Fake');
    expect(html).toContain('Questions people ask');
    expect(html.match(/<details>/g)).toHaveLength(4);
    expect(html).toContain(
      `rel="canonical" href="https://alfaiate-tl.example/areas/${area}"`,
    );
    expect(html).not.toContain('name="robots" content="noindex');
    expect(await (await get('/sitemap.xml')).text()).toContain(
      `/areas/${area}`,
    );
    expect(await (await get(`/tet/areas/${area}`)).text()).toContain(
      '<html lang="tet">',
    );
  });
  it('keep an area with no published tailor out of search and out of the sitemap, and answer 404 for unknown ones', async () => {
    const { area } = await make(false);
    const html = await (await get(`/areas/${area}`)).text();
    expect(html).toContain('name="robots" content="noindex,follow"');
    expect(await (await get('/sitemap.xml')).text()).not.toContain(
      `/areas/${area}`,
    );
    expect((await get('/areas/no-such-area-fake')).status).toBe(404);
    expect((await get('/areas/..%2Fadmin')).status).toBe(404);
  });
  it('are linked from the directory, and an empty category is noindex', async () => {
    const { area, cat } = await make(false);
    const dir = await (await get('/tailors')).text();
    expect(dir).toContain('Browse by area');
    expect(dir).toContain('Questions people ask');
    expect(await (await get(`/categories/${cat}`)).text()).toContain(
      'name="robots" content="noindex,follow"',
    );
    void area;
  });
});
