import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn, unique } from './helpers';

// Admin polish, batch B: Garment types and Areas (one Save per row, use counts, a question before hiding), the Tailors list (search, sort, counts) and the Products list.
const run = (sql: string, ...args: (string | number | null)[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();

describe('garment types and areas', () => {
  it('shows one Save per row, how many tailors use it, and asks before hiding one', async () => {
    const n = unique();
    const cat = (
      await run(
        'INSERT INTO garment_category (slug, name, sort_order) VALUES (?, ?, 40)',
        `polish-cat-${n}`,
        `Polish Cat ${n}`,
      )
    ).meta.last_row_id;
    const t = (
      await run(
        'INSERT INTO tailor (slug, display_name) VALUES (?, ?)',
        `polish-t-${n}`,
        `Polish T ${n}`,
      )
    ).meta.last_row_id;
    await run(
      'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
      t,
      cat,
    );
    const html = await (
      await get('/admin/categories', await signIn('owner'))
    ).text();
    const row = new RegExp(
      `<li class="catalog-row[^"]*">((?:(?!</li>)[\\s\\S])*id="name-${cat}"[\\s\\S]*?)</li>`,
    ).exec(html)![1]!;
    expect(row).toContain('value="update"');
    expect(row.match(/<button type="submit">Save<\/button>/g)).toHaveLength(1);
    expect(row).toContain('Used by 1 tailor');
    expect(row).toContain('<details class="confirm">');
    expect(row).toContain('Yes, deactivate');
    expect(html).toContain('<h1>Garment types</h1>');
    expect(html).not.toContain('<a href="/admin">Dashboard</a>'); // the stray link is gone
    await run(
      'INSERT INTO service_area (slug, name, sort_order) VALUES (?, ?, 40)',
      `polish-area-${n}`,
      `Polish Area ${n}`,
    );
    const area = await (
      await get('/admin/areas', await signIn('owner'))
    ).text();
    expect(area).toContain('Not used by any tailor yet');
  });

  it('the single Save changes the name, the description and the order together, and refuses a bad row', async () => {
    const n = unique();
    const cat = (
      await run(
        'INSERT INTO garment_category (slug, name, sort_order) VALUES (?, ?, 41)',
        `polish-up-${n}`,
        `Polish Up ${n}`,
      )
    ).meta.last_row_id;
    const owner = await signIn('owner');
    const saved = await post('/admin/categories', owner, {
      csrf: await csrfOf(owner),
      action: 'update',
      id: String(cat),
      name: `Polish Renamed ${n}`,
      description: 'A description',
      sort_order: '7',
    });
    expect(saved.headers.get('location')).toContain('msg=saved');
    const row = await env.DB.prepare(
      'SELECT name, description, sort_order FROM garment_category WHERE id = ?',
    )
      .bind(cat)
      .first();
    expect(row).toEqual({
      name: `Polish Renamed ${n}`,
      description: 'A description',
      sort_order: 7,
    });
    const bad = await post('/admin/categories', owner, {
      csrf: await csrfOf(owner),
      action: 'update',
      id: String(cat),
      name: '',
      sort_order: '1',
    });
    expect(bad.headers.get('location')).toContain('msg=invalid');
    const noOrder = await post('/admin/categories', owner, {
      csrf: await csrfOf(owner),
      action: 'update',
      id: String(cat),
      name: 'x',
    });
    expect(noOrder.headers.get('location')).toContain('msg=invalid');
    const after = await env.DB.prepare(
      'SELECT name FROM garment_category WHERE id = ?',
    )
      .bind(cat)
      .first<{ name: string }>();
    expect(after!.name).toBe(`Polish Renamed ${n}`);
  });
});

describe('tailors list', () => {
  it('counts, searches by name or phone, sorts, and says when nothing matches', async () => {
    const n = unique();
    await run(
      'INSERT INTO tailor (slug, display_name, whatsapp_e164) VALUES (?, ?, ?)',
      `polish-find-${n}`,
      `Polish Findable ${n}`,
      '+67070008123',
    );
    const owner = await signIn('owner');
    const all = await (await get('/admin/tailors', owner)).text();
    expect(all).toMatch(
      /\d+ in all: \d+ published, \d+ ready to publish\.\s*Not ready to publish: \d+/,
    );
    expect(all).toContain('Find a tailor by name or phone');
    const byName = await (
      await get(`/admin/tailors?q=findable%20${n}`, owner)
    ).text();
    expect(byName).toContain(`Polish Findable ${n}`);
    const byPhone = await (
      await get('/admin/tailors?q=70008123', owner)
    ).text();
    expect(byPhone).toContain(`Polish Findable ${n}`);
    const none = await (
      await get('/admin/tailors?q=zzzznomatch', owner)
    ).text();
    expect(none).toContain('No tailor matches');
    const recent = await (
      await get('/admin/tailors?sort=updated', owner)
    ).text();
    expect(recent.indexOf(`Polish Findable ${n}`)).toBeGreaterThan(-1);
    expect(recent).toContain('<option value="updated" selected>');
    // typed text comes back escaped
    const hostile = await (
      await get(
        '/admin/tailors?q=%22%3E%3Cscript%3Ealert(1)%3C/script%3E',
        owner,
      )
    ).text();
    expect(hostile.replace(/="[^"]*"/g, '=""')).not.toContain(
      '<script>alert(1)',
    );
  });
});

describe('products list and form', () => {
  it('searches and filters the list, and folds the optional text boxes of the form', async () => {
    const n = unique();
    await run(
      "INSERT INTO product (slug, name, description, is_published) VALUES (?, ?, 'A polish product', 0)",
      `polish-p-${n}`,
      `Polish Product ${n}`,
    );
    const owner = await signIn('owner');
    const list = await (
      await get(`/admin/products?q=polish%20product%20${n}&status=draft`, owner)
    ).text();
    expect(list).toContain(`Polish Product ${n}`);
    expect(list).toMatch(/\d+ in all: \d+ published, \d+ draft\./);
    const published = await (
      await get(
        `/admin/products?q=polish%20product%20${n}&status=published`,
        owner,
      )
    ).text();
    expect(published).toContain('No product matches');
    const form = await (await get('/admin/products/new', owner)).text();
    expect(form).toMatch(
      /<details class="wide more-fields">\s*<summary>More for the product page/,
    );
    for (const name of ['details', 'features', 'returns'])
      expect(form).toContain(`name="${name}"`);
  });
});

describe('one page header on every admin list page', () => {
  it('has a single h1 inside .page-head and no loose Dashboard link', async () => {
    const owner = await signIn('owner');
    for (const path of [
      '/admin',
      '/admin/enquiries',
      '/admin/orders',
      '/admin/tailors',
      '/admin/categories',
      '/admin/areas',
      '/admin/products',
      '/admin/interest',
      '/admin/traffic',
      '/admin/newsletter',
      '/admin/users',
      '/admin/account',
    ]) {
      const html = await (await get(path, owner)).text();
      expect(html.match(/<h1[ >]/g), path).toHaveLength(1);
      expect(html, path).toContain('class="page-head"');
      const main = html.slice(html.indexOf('<main'));
      expect(main, path).not.toMatch(/<p>\s*<a href="\/admin">Dashboard<\/a>/);
    }
  });
});
