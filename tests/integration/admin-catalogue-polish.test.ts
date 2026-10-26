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

// Batch C: Join requests (filter, contact buttons), Orders (search, cards), Enquiries (source and waiting filters).
describe('join requests, orders and enquiries lists', () => {
  it('Join requests: chips filter by decision, waiting ones come first and carry Call and WhatsApp with the reference only', async () => {
    const n = unique();
    const owner = await signIn('owner');
    await run(
      "INSERT INTO tailor_interest (reference_code, contact_name, phone_e164, consent_contact, consent_text_version, consent_at, decision) VALUES (?, 'Polish Fake Waiting', '+67070009101', 1, 'v1', '2026-01-01T00:00:00Z', 'pending')",
      `JN-${n}A`,
    );
    await run(
      "INSERT INTO tailor_interest (reference_code, contact_name, phone_e164, consent_contact, consent_text_version, consent_at, decision, decided_at) VALUES (?, 'Polish Fake Declined', '+67070009102', 1, 'v1', '2026-01-02T00:00:00Z', 'declined', '2026-01-03T00:00:00Z')",
      `JN-${n}B`,
    );
    const all = await (await get('/admin/interest', owner)).text();
    expect(all).toMatch(/Waiting for you \d+/);
    expect(all.indexOf('Polish Fake Waiting')).toBeLessThan(
      all.indexOf('Polish Fake Declined'),
    );
    expect(all).toContain('href="tel:+67070009101"');
    expect(all).toContain('https://wa.me/67070009101?text=');
    expect(all).not.toContain('tel:+67070009102'); // decided rows get no contact buttons
    expect(
      decodeURIComponent(/wa\.me\/67070009101\?text=([^"]+)"/.exec(all)![1]!),
    ).not.toContain('Polish');
    const declined = await (
      await get('/admin/interest?show=declined', owner)
    ).text();
    expect(declined).toContain('Polish Fake Declined');
    expect(declined).not.toContain('Polish Fake Waiting');
  });

  it('Orders: search by reference, with phone cards beside the table', async () => {
    const n = unique();
    const owner = await signIn('owner');
    await run(
      'INSERT INTO shop_order (reference_code, total_cents, items_json, routes_json) VALUES (?, 1500, \'[{"name":"Polish Cloth","quantity":2}]\', \'[]\')',
      `OR-ZP${String(n).padStart(6, '0')}`,
    );
    const hit = await (
      await get(`/admin/orders?q=ZP${String(n).padStart(6, '0')}`, owner)
    ).text();
    expect(hit).toContain(`OR-ZP${String(n).padStart(6, '0')}`);
    expect(hit).toContain('Polish Cloth × 2');
    expect(hit).toContain('class="req-cards"');
    const miss = await (await get('/admin/orders?q=zzzznomatch', owner)).text();
    expect(miss).toContain('No order matches');
    const wild = await (
      await get('/admin/orders?q=%25%5C%F0%9F%98%80', owner)
    ).text();
    expect(wild).toContain('No order matches'); // % \ and emoji do not break the LIKE
  });

  it('Enquiries: filter by where it came from and by waiting over 24 hours', async () => {
    const n = unique();
    const owner = await signIn('owner');
    const mk = (ref: string, source: string, created: string) =>
      run(
        "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status, source, created_at) VALUES (?, 'Polish Fake Customer', '+67070009103', 'phone', 1, 'v1', '2026-01-01T00:00:00Z', 'new', ?, ?)",
        ref,
        source,
        created,
      );
    await mk(`AT-PS${n}`, 'shop', '2020-01-01T00:00:00.000Z');
    await mk(`AT-PF${n}`, 'form', new Date().toISOString());
    const shop = await (
      await get(`/admin/enquiries?source=shop&q=P${'S'}${n}`, owner)
    ).text();
    expect(shop).toContain(`AT-PS${n}`);
    const formOnly = await (
      await get(`/admin/enquiries?source=form&q=PS${n}`, owner)
    ).text();
    expect(formOnly).not.toContain(`AT-PS${n}`);
    const waiting = await (
      await get('/admin/enquiries?waiting=1', owner)
    ).text();
    expect(waiting).toContain(`AT-PS${n}`);
    expect(waiting).not.toContain(`AT-PF${n}`);
    expect(waiting).toContain('<option value="" selected>Anywhere</option>');
  });
});

// Batch D: Newsletter asks before removing an address; Traffic keeps the privacy note short in the header and lays the tables out in a grid.
describe('newsletter and traffic pages', () => {
  it('Newsletter: a count line, and Remove asks first', async () => {
    const n = unique();
    const owner = await signIn('owner');
    await run(
      "INSERT INTO newsletter_signup (email, consent_text_version, consent_at) VALUES (?, 'v', '2026-01-01T00:00:00Z')",
      `polish${n}@example.test`,
    );
    const html = await (
      await get(`/admin/newsletter?email=polish${n}@`, owner)
    ).text();
    expect(html).toContain('1 found.');
    const row =
      /<tr>(?:(?!<\/tr>)[\s\S])*polish\d+@example\.test(?:(?!<\/tr>)[\s\S])*<\/tr>/.exec(
        html,
      )![0];
    expect(row).toContain('<details class="confirm">');
    expect(row).toContain('Yes, remove');
  });

  it('Traffic: short subtitle, privacy note under it, two tables side by side, days folded', async () => {
    const owner = await signIn('owner');
    await run(
      "INSERT INTO page_view_daily (day, path, referrer, count) VALUES (date('now'), '/polish-d', 'direct', 3) ON CONFLICT DO NOTHING",
    );
    const html = await (await get('/admin/traffic', owner)).text();
    expect(html).toContain('class="traffic-grid"');
    expect(html).toMatch(
      /<details class="more-fields">\s*<summary>Views day by day/,
    );
    expect(html).toMatch(/<p class="hint">\s*The site sets no cookies/);
    expect(html).not.toMatch(/page-head__sub">[^<]*sets no cookies/);
  });
});
