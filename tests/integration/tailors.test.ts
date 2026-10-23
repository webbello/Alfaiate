import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn, unique } from './helpers';

const addTailor = async (
  name = `Fake Tailor ${unique()}`,
  published = false,
) => {
  const slug = `t-${unique()}`;
  const id = (
    await env.DB.prepare(
      'INSERT INTO tailor (slug, display_name) VALUES (?, ?)',
    )
      .bind(slug, name)
      .run()
  ).meta.last_row_id;
  if (published)
    await env.DB.prepare(
      "UPDATE tailor SET status = 'approved', permission_recorded = 1, contact_publish_consent = 1, phone_e164 = '+67077123456', is_published = 1 WHERE id = ?",
    )
      .bind(id)
      .run();
  return id;
};
const addCategory = async (name = `Cat ${unique()}`) =>
  (
    await env.DB.prepare(
      'INSERT INTO garment_category (slug, name) VALUES (?, ?)',
    )
      .bind(`c-${unique()}`, name)
      .run()
  ).meta.last_row_id;
const addArea = async (name = `Area ${unique()}`) =>
  (
    await env.DB.prepare('INSERT INTO service_area (slug, name) VALUES (?, ?)')
      .bind(`a-${unique()}`, name)
      .run()
  ).meta.last_row_id;

describe('tailor list and create', () => {
  it('lets an editor create a draft and lands on its edit page', async () => {
    const cookie = await signIn('editor');
    const csrf = await csrfOf(cookie);
    const created = await post('/admin/tailors/new', cookie, {
      csrf,
      display_name: 'Atelier Fake',
      whatsapp: '7712 3456',
    });
    expect(created.status).toBe(303);
    const location = created.headers.get('location') ?? '';
    expect(location).toMatch(/^\/admin\/tailors\/\d+$/);
    const html = await (await get(location, cookie)).text();
    expect(html).toContain('Atelier Fake');
    expect(html).toContain('+67077123456');
    const list = await (await get('/admin/tailors', cookie)).text();
    expect(list).toContain('Atelier Fake');
  });

  it('saves the work types and shop areas ticked on the first form with the draft, in one submit (admin redesign T4)', async () => {
    const cat = await addCategory('Tick Suits');
    const area = await addArea('Tick Area');
    const cookie = await signIn('editor');
    const csrf = await csrfOf(cookie);
    const created = await post('/admin/tailors/new', cookie, {
      csrf,
      display_name: 'Atelier Ticks',
      [`cat_${cat}`]: 'on',
      [`shop_${area}`]: 'on',
    });
    expect(created.status).toBe(303);
    const id = Number(created.headers.get('location')?.split('/').pop());
    const cats = await env.DB.prepare(
      'SELECT category_id FROM tailor_category WHERE tailor_id = ?',
    )
      .bind(id)
      .all();
    const areas = await env.DB.prepare(
      'SELECT area_id, kind FROM tailor_area WHERE tailor_id = ?',
    )
      .bind(id)
      .all();
    expect(cats.results).toEqual([{ category_id: cat }]);
    expect(areas.results).toEqual([{ area_id: area, kind: 'shop_location' }]);
  });

  it('keeps the draft and says what failed when a ticked work type cannot be linked', async () => {
    const cat = await addCategory('Gone Cat');
    await env.DB.prepare(
      'UPDATE garment_category SET is_active = 0 WHERE id = ?',
    )
      .bind(cat)
      .run();
    const cookie = await signIn('editor');
    const created = await post('/admin/tailors/new', cookie, {
      csrf: await csrfOf(cookie),
      display_name: 'Atelier Half',
      [`cat_${cat}`]: 'on',
    });
    expect(created.headers.get('location')).toMatch(
      /^\/admin\/tailors\/\d+\?msg=inactive$/,
    );
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM tailor WHERE display_name = 'Atelier Half'",
        ).first<{ n: number }>()
      )?.n,
    ).toBe(1);
  });

  it('lists categories as a tick list: only a ticked category is checked, each keeps its price fields (admin redesign)', async () => {
    const on = await addCategory('Row On');
    const off = await addCategory('Row Off');
    const id = await addTailor();
    await env.DB.prepare(
      'INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to) VALUES (?, ?, 2000, 5000)',
    )
      .bind(id, on)
      .run();
    const html = await (
      await get(`/admin/tailors/${id}`, await signIn('manager'))
    ).text();
    const row = (cat: number) =>
      html.match(
        new RegExp(
          `<div class="cat-row">(?:(?!<div class="cat-row">)[\\s\\S])*?name="cat_${cat}"[\\s\\S]*?name="source_${cat}"`,
        ),
      )?.[0] ?? '';
    expect(row(on)).toMatch(/name="cat_\d+"[^>]*checked/);
    expect(row(on)).toContain(`name="from_${on}"`);
    expect(row(on)).toContain('value="20"');
    expect(row(off)).not.toMatch(/name="cat_\d+"[^>]*checked/);
    expect(row(off)).toContain(`name="to_${off}"`);
    expect(html).toContain('class="cat-count"');
  });

  it('shows the essentials first and folds the rest into "More detail"; a viewer cannot open the form', async () => {
    const html = await (
      await get('/admin/tailors/new', await signIn('editor'))
    ).text();
    const [essentials, more] = html.split('<summary>More detail');
    expect(essentials).toContain('id="display_name"');
    expect(essentials).toContain('id="whatsapp"');
    expect(essentials).not.toContain('id="description"');
    expect(more).toContain('id="description"');
    expect(more).not.toContain('id="display_name"');
    expect(
      (await get('/admin/tailors/new', await signIn('viewer'))).status,
    ).toBe(403);
  });

  it('shows field-level errors and creates nothing when the form is wrong', async () => {
    const cookie = await signIn('editor');
    const csrf = await csrfOf(cookie);
    const response = await post('/admin/tailors/new', cookie, {
      csrf,
      display_name: '',
      phone: 'abc',
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      '/admin/tailors/new?msg=invalid&fields=display_name,phone',
    );
    const html = await (
      await get(response.headers.get('location')!, cookie)
    ).text();
    expect(html).toContain('Please check the details');
    expect(
      await env.DB.prepare(
        "SELECT 1 FROM tailor WHERE display_name = ''",
      ).first(),
    ).toBeNull();
  });

  it('refuses a create without the csrf token', async () => {
    const cookie = await signIn('editor');
    const before = (await env.DB.prepare(
      'SELECT count(*) AS c FROM tailor',
    ).first<{ c: number }>())!.c;
    expect(
      (await post('/admin/tailors/new', cookie, { display_name: 'No Csrf' }))
        .status,
    ).toBe(403);
    expect(
      (await env.DB.prepare('SELECT count(*) AS c FROM tailor').first<{
        c: number;
      }>())!.c,
    ).toBe(before);
  });

  it('keeps a hostile name inert and the pages free of inline script and style', async () => {
    const cookie = await signIn('editor');
    const csrf = await csrfOf(cookie);
    const created = await post('/admin/tailors/new', cookie, {
      csrf,
      display_name: '"><img src=x onerror=alert(1)>',
    });
    const page = await (
      await get(created.headers.get('location')!, cookie)
    ).text();
    const list = await (await get('/admin/tailors', cookie)).text();
    for (const html of [page, list]) {
      expect(html).not.toContain('"><img');
      expect(html).not.toContain('<style');
      expect(html).not.toMatch(/<script(?![^>]*src=)/);
    }
  });
});

describe('edit page and actions', () => {
  it('saves the profile and shows the new values', async () => {
    const cookie = await signIn('editor');
    const csrf = await csrfOf(cookie);
    const id = await addTailor();
    const saved = await post(`/admin/tailors/${id}/actions`, cookie, {
      csrf,
      action: 'save_profile',
      display_name: 'Edited Name',
      description: 'Good suits',
      home_visits: 'yes',
      whatsapp: '',
      phone: '3312 3456',
    });
    expect(saved.headers.get('location')).toBe(
      `/admin/tailors/${id}?msg=saved`,
    );
    const html = await (await get(`/admin/tailors/${id}`, cookie)).text();
    expect(html).toContain('Edited Name');
    expect(html).toContain('Good suits');
    expect(html).toContain('+67033123456');
  });

  it('names the wrong fields without losing the rest', async () => {
    const cookie = await signIn('editor');
    const csrf = await csrfOf(cookie);
    const id = await addTailor();
    const response = await post(`/admin/tailors/${id}/actions`, cookie, {
      csrf,
      action: 'save_profile',
      display_name: 'Ok',
      whatsapp: '999',
    });
    expect(response.headers.get('location')).toBe(
      `/admin/tailors/${id}?msg=invalid&fields=whatsapp`,
    );
  });

  it('refuses without the csrf token and changes nothing', async () => {
    const cookie = await signIn('editor');
    const id = await addTailor('Before');
    expect(
      (
        await post(`/admin/tailors/${id}/actions`, cookie, {
          action: 'save_profile',
          display_name: 'After',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await env.DB.prepare('SELECT display_name FROM tailor WHERE id = ?')
          .bind(id)
          .first<{ display_name: string }>()
      )?.display_name,
    ).toBe('Before');
  });

  it('saves categories with prices in cents and shows them back as dollars', async () => {
    const cookie = await signIn('editor');
    const csrf = await csrfOf(cookie);
    const id = await addTailor();
    const cat = await addCategory('Suits Fake');
    await post(`/admin/tailors/${id}/actions`, cookie, {
      csrf,
      action: 'save_categories',
      [`cat_${cat}`]: 'on',
      [`from_${cat}`]: '20',
      [`to_${cat}`]: '35.5',
      [`unit_${cat}`]: 'per suit',
    });
    const stored = await env.DB.prepare(
      'SELECT price_from, price_to, price_source FROM tailor_category WHERE tailor_id = ?',
    )
      .bind(id)
      .first();
    expect(stored).toEqual({
      price_from: 2000,
      price_to: 3550,
      price_source: 'tailor_supplied',
    });
    const html = await (await get(`/admin/tailors/${id}`, cookie)).text();
    expect(html).toContain('value="35.50"');
  });

  it('saves areas', async () => {
    const cookie = await signIn('editor');
    const csrf = await csrfOf(cookie);
    const id = await addTailor();
    const area = await addArea();
    await post(`/admin/tailors/${id}/actions`, cookie, {
      csrf,
      action: 'save_areas',
      [`shop_${area}`]: 'on',
      [`serves_${area}`]: 'on',
    });
    expect(
      (
        await env.DB.prepare(
          'SELECT count(*) AS c FROM tailor_area WHERE tailor_id = ?',
        )
          .bind(id)
          .first<{ c: number }>()
      )?.c,
    ).toBe(2);
  });

  it('adds internal notes, shown only on this admin page', async () => {
    const cookie = await signIn('editor');
    const csrf = await csrfOf(cookie);
    const id = await addTailor();
    await post(`/admin/tailors/${id}/actions`, cookie, {
      csrf,
      action: 'add_note',
      body: 'Called on Monday about prices',
    });
    expect(await (await get(`/admin/tailors/${id}`, cookie)).text()).toContain(
      'Called on Monday about prices',
    );
    expect(await (await get('/admin/tailors', cookie)).text()).not.toContain(
      'Called on Monday',
    );
  });

  it('answers 404-style for an unknown tailor and ignores a non-numeric id', async () => {
    const cookie = await signIn('editor');
    expect((await get('/admin/tailors/999999', cookie)).status).toBe(404);
    expect((await get('/admin/tailors/abc', cookie)).status).toBe(404);
  });

  it('cannot be used to change status, publishing or verification (mass assignment)', async () => {
    const cookie = await signIn('manager');
    const csrf = await csrfOf(cookie);
    const id = await addTailor();
    await post(`/admin/tailors/${id}/actions`, cookie, {
      csrf,
      action: 'save_profile',
      display_name: 'Mass',
      status: 'approved',
      is_published: '1',
      permission_recorded: '1',
      verified_fields: '["description"]',
      fee_terms_text: 'x',
    });
    expect(
      await env.DB.prepare(
        'SELECT status, is_published, permission_recorded, verified_fields, fee_terms_text FROM tailor WHERE id = ?',
      )
        .bind(id)
        .first(),
    ).toEqual({
      status: 'draft',
      is_published: 0,
      permission_recorded: 0,
      verified_fields: '[]',
      fee_terms_text: null,
    });
  });
});

describe('the editor lock on published tailors', () => {
  it('lets an editor view but not change a published tailor; a manager can change it', async () => {
    const editor = await signIn('editor');
    const manager = await signIn('manager');
    const id = await addTailor('Published Fake', true);
    const view = await get(`/admin/tailors/${id}`, editor);
    expect(view.status).toBe(200);
    expect(await view.text()).toContain('only be edited by a manager');
    const editorCsrf = await csrfOf(editor);
    expect(
      (
        await post(`/admin/tailors/${id}/actions`, editor, {
          csrf: editorCsrf,
          action: 'save_profile',
          display_name: 'Sneaky',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(`/admin/tailors/${id}/actions`, editor, {
          csrf: editorCsrf,
          action: 'save_areas',
        })
      ).status,
    ).toBe(403);
    const managerCsrf = await csrfOf(manager);
    expect(
      (
        await post(`/admin/tailors/${id}/actions`, manager, {
          csrf: managerCsrf,
          action: 'save_profile',
          display_name: 'By Manager',
          phone: '7712 3456',
        })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${id}?msg=saved`);
  });

  it('still lets an editor add a note to a published tailor', async () => {
    const editor = await signIn('editor');
    const csrf = await csrfOf(editor);
    const id = await addTailor('Published Notes', true);
    expect(
      (
        await post(`/admin/tailors/${id}/actions`, editor, {
          csrf,
          action: 'add_note',
          body: 'internal only',
        })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${id}?msg=added`);
  });
});

describe('roles', () => {
  it('keeps viewers out of every tailor page and action', async () => {
    const viewer = await signIn('viewer');
    const id = await addTailor();
    for (const path of [
      '/admin/tailors',
      '/admin/tailors/new',
      `/admin/tailors/${id}`,
    ])
      expect((await get(path, viewer)).status).toBe(403);
    expect(
      (
        await post(`/admin/tailors/${id}/actions`, viewer, {
          csrf: 'x',
          action: 'add_note',
          body: 'nope',
        })
      ).status,
    ).toBe(403);
  });
});
