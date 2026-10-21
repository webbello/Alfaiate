import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, get, unique } from './helpers';
import { worker } from './worker';
import { jpeg } from '../workers/fixtures/images';
import { approveInterest } from '../../src/modules/portal/approve';
import { consumeInvite } from '../../src/modules/portal/invite';
import { createTailorSession } from '../../src/modules/portal/session';

// S4 to S6 through the real handlers, with fake data only.
const db = env.DB;
const tailorLogin = async () => {
  const ref = `JN-PC${String(unique()).padStart(6, '0')}`;
  await db
    .prepare(
      "INSERT INTO tailor_interest (reference_code, contact_name, business_name, phone_e164, consent_contact, consent_text_version, consent_at) VALUES (?, 'Content Fake', 'Content Atelier Fake', '+67077123456', 1, 'v', 'now')",
    )
    .bind(ref)
    .run();
  const id = (await db
    .prepare('SELECT id FROM tailor_interest WHERE reference_code = ?')
    .bind(ref)
    .first<{ id: number }>())!.id;
  const actor = (
    await db
      .prepare(
        "INSERT INTO admin_user (email, password_hash, role) VALUES (?, 'x', 'manager')",
      )
      .bind(`pc${unique()}@example.test`)
      .run()
  ).meta.last_row_id;
  const r = await approveInterest(db, { id, actorId: actor });
  if (!r.ok) throw new Error('setup');
  await consumeInvite(db, r.token, {
    email: `pc${unique()}@example.test`,
    passwordHash: 'x',
    consentVersion: 'v',
  });
  const session = await createTailorSession(db, r.accountId);
  const cookie = `__Host-alfaiate_tailor=${session.token}`;
  const csrf =
    /name="csrf" value="([^"]+)"/.exec(
      await (await get('/portal/photos', cookie)).text(),
    )?.[1] ?? '';
  return { cookie, tailorId: r.tailorId, csrf };
};
const send = (
  path: string,
  cookie: string,
  body: Record<string, string> | FormData,
  method = 'POST',
) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { Cookie: cookie, Origin: ORIGIN },
      body: body instanceof FormData ? body : new URLSearchParams(body),
      redirect: 'manual',
    }),
  );
const photoForm = (csrf: string, over: Record<string, string> = {}) => {
  const f = new FormData();
  f.set('csrf', csrf);
  f.set('alt_text', 'A fake shirt');
  f.set('confirm', 'yes');
  for (const [k, v] of Object.entries(over)) f.set(k, v);
  f.set(
    'thumb',
    new File([new Uint8Array(jpeg({ width: 320, height: 240 }))], 'thumb.jpg', {
      type: 'image/jpeg',
    }),
  );
  f.set(
    'medium',
    new File(
      [new Uint8Array(jpeg({ width: 800, height: 600 }))],
      'medium.jpg',
      {
        type: 'image/jpeg',
      },
    ),
  );
  f.set(
    'large',
    new File(
      [new Uint8Array(jpeg({ width: 1600, height: 1200 }))],
      'large.jpg',
      {
        type: 'image/jpeg',
      },
    ),
  );
  return f;
};

describe('profile page', () => {
  it("shows the tailor's own details, saves changes, and ignores forged fields", async () => {
    const t = await tailorLogin();
    const page = await (await get('/portal/profile', t.cookie)).text();
    expect(page).toContain('value="Content Atelier Fake"');
    expect(page).not.toContain('+67077123456'); // the private number is the owner's note, never shown back
    const done = await send('/portal/profile', t.cookie, {
      display_name: 'Renamed Fake',
      description: 'Fake words',
      slug: 'hijack',
      status: 'approved',
      is_published: '1',
      fee_terms_text: 'x',
    });
    expect(done.status).toBe(303);
    expect(done.headers.get('location')).toBe('/portal/profile?saved=1');
    const row = await db
      .prepare(
        'SELECT display_name, description, slug, status, is_published, fee_terms_text FROM tailor WHERE id = ?',
      )
      .bind(t.tailorId)
      .first<Record<string, unknown>>();
    expect(row).toMatchObject({
      display_name: 'Renamed Fake',
      description: 'Fake words',
      status: 'draft',
      is_published: 0,
      fee_terms_text: null,
    });
    expect(row!.slug).not.toBe('hijack');
    const bad = await send('/portal/profile', t.cookie, { display_name: '' });
    expect(bad.status).toBe(422);
    expect(await bad.text()).toContain('Please check the details');
  });
  it('needs a tailor sign-in', async () => {
    for (const path of ['/portal/profile', '/portal/work', '/portal/photos']) {
      const res = await get(path);
      expect([res.status, res.headers.get('location')], path).toEqual([
        302,
        '/portal/login',
      ]);
    }
    expect(
      (await send('/portal/profile', '', { display_name: 'x' })).status,
    ).toBe(302);
  });
});

describe('work page', () => {
  it('lists the active types and areas and saves the ticks', async () => {
    const t = await tailorLogin();
    const cat = (
      await db
        .prepare(
          "INSERT INTO garment_category (slug, name) VALUES (?, 'Work Cat Fake')",
        )
        .bind(`wc-${unique()}`)
        .run()
    ).meta.last_row_id;
    const area = (
      await db
        .prepare(
          "INSERT INTO service_area (slug, name) VALUES (?, 'Work Area Fake')",
        )
        .bind(`wa-${unique()}`)
        .run()
    ).meta.last_row_id;
    const page = await (await get('/portal/work', t.cookie)).text();
    expect(page).toContain('Work Cat Fake');
    expect(page).toContain('Work Area Fake');
    const done = await send('/portal/work', t.cookie, {
      [`cat_${cat}`]: 'on',
      [`serves_${area}`]: 'on',
    });
    expect(done.status).toBe(303);
    const after = await (await get('/portal/work', t.cookie)).text();
    expect(after).toMatch(new RegExp(`name="cat_${cat}"[^>]*checked`));
  });
});

describe('photos', () => {
  it('uploads through the handler, hidden and private, previews to its owner only, and never publicly', async () => {
    const mine = await tailorLogin();
    const other = await tailorLogin();
    const done = await send(
      '/portal/photos/upload',
      mine.cookie,
      photoForm(mine.csrf),
    );
    expect(done.status).toBe(303);
    expect(done.headers.get('location')).toBe('/portal/photos?msg=uploaded');
    const image = await db
      .prepare(
        'SELECT file_key, is_visible, permission_granted FROM portfolio_image WHERE tailor_id = ?',
      )
      .bind(mine.tailorId)
      .first<{
        file_key: string;
        is_visible: number;
        permission_granted: number;
      }>();
    expect(image).toMatchObject({ is_visible: 0, permission_granted: 1 });
    const key = `tailor/${mine.tailorId}/${image!.file_key}/thumb.jpg`;
    const page = await (await get('/portal/photos', mine.cookie)).text();
    expect(page).toContain(`/portal/media/${key}`);
    expect(page).toContain('Waiting for the team');
    expect((await get(`/portal/media/${key}`, mine.cookie)).status).toBe(200);
    expect((await get(`/portal/media/${key}`, other.cookie)).status).toBe(404);
    expect((await get(`/portal/media/${key}`)).status).toBe(302);
    expect((await get(`/media/${key}`)).status).toBe(404);
  });
  it('refuses a missing CSRF token, a missing confirmation and a missing size', async () => {
    const t = await tailorLogin();
    expect(
      (await send('/portal/photos/upload', t.cookie, photoForm('wrong')))
        .status,
    ).toBe(403);
    const unconfirmed = photoForm(t.csrf);
    unconfirmed.delete('confirm');
    expect(
      (await send('/portal/photos/upload', t.cookie, unconfirmed)).headers.get(
        'location',
      ),
    ).toBe('/portal/photos?msg=not_confirmed');
    const partial = photoForm(t.csrf);
    partial.delete('large');
    expect(
      (await send('/portal/photos/upload', t.cookie, partial)).headers.get(
        'location',
      ),
    ).toBe('/portal/photos?msg=missing_variant');
    expect(
      (await db
        .prepare(
          'SELECT count(*) AS c FROM portfolio_image WHERE tailor_id = ?',
        )
        .bind(t.tailorId)
        .first<{ c: number }>())!.c,
    ).toBe(0);
  });
  it("describes and removes its own photo through the handler, and another tailor's id is refused", async () => {
    const mine = await tailorLogin();
    const other = await tailorLogin();
    await send('/portal/photos/upload', mine.cookie, photoForm(mine.csrf));
    await send('/portal/photos/upload', other.cookie, photoForm(other.csrf));
    const own = (await db
      .prepare('SELECT id FROM portfolio_image WHERE tailor_id = ?')
      .bind(mine.tailorId)
      .first<{ id: number }>())!.id;
    const theirs = (await db
      .prepare('SELECT id FROM portfolio_image WHERE tailor_id = ?')
      .bind(other.tailorId)
      .first<{ id: number }>())!.id;
    const save = (
      id: number,
      action: string,
      extra: Record<string, string> = {},
    ) =>
      send('/portal/photos/save', mine.cookie, {
        csrf: mine.csrf,
        action,
        image_id: String(id),
        ...extra,
      });
    expect(
      (await save(own, 'details', { alt_text: 'Changed words' })).headers.get(
        'location',
      ),
    ).toBe('/portal/photos?msg=saved');
    expect(
      (await save(theirs, 'details', { alt_text: 'Hijack' })).headers.get(
        'location',
      ),
    ).toBe('/portal/photos?msg=invalid');
    expect((await save(theirs, 'delete')).headers.get('location')).toBe(
      '/portal/photos?msg=invalid',
    );
    expect(
      (await db
        .prepare('SELECT alt_text FROM portfolio_image WHERE id = ?')
        .bind(theirs)
        .first<{ alt_text: string }>())!.alt_text,
    ).toBe('A fake shirt');
    expect(
      (
        await send('/portal/photos/save', mine.cookie, {
          csrf: 'bad',
          action: 'delete',
          image_id: String(own),
        })
      ).status,
    ).toBe(403);
    expect((await save(own, 'delete')).headers.get('location')).toBe(
      '/portal/photos?msg=removed',
    );
  });
});

describe('overview and "ready for review"', () => {
  it('shows the checklist, keeps the button off until the required items are done, and tells the owner once they are', async () => {
    const t = await tailorLogin();
    const page = await (await get('/portal', t.cookie)).text();
    expect(page).toContain('Getting your page ready');
    expect(page).toMatch(/<button type="submit" disabled>My page is ready/);
    const early = await send('/portal/submit', t.cookie, { csrf: t.csrf });
    expect(early.headers.get('location')).toBe('/portal?msg=incomplete');
    const cat = (
      await db
        .prepare(
          "INSERT INTO garment_category (slug, name) VALUES (?, 'Ready Cat')",
        )
        .bind(`rc-${unique()}`)
        .run()
    ).meta.last_row_id;
    const area = (
      await db
        .prepare(
          "INSERT INTO service_area (slug, name) VALUES (?, 'Ready Area')",
        )
        .bind(`ra-${unique()}`)
        .run()
    ).meta.last_row_id;
    await db
      .prepare(
        "UPDATE tailor SET description = 'I sew.', whatsapp_e164 = '+67077123456' WHERE id = ?",
      )
      .bind(t.tailorId)
      .run();
    await db
      .prepare(
        'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
      )
      .bind(t.tailorId, cat)
      .run();
    await db
      .prepare(
        "INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, 'shop_location')",
      )
      .bind(t.tailorId, area)
      .run();
    expect(await (await get('/portal', t.cookie)).text()).not.toMatch(
      /<button type="submit" disabled>My page is ready/,
    );
    expect(
      (await send('/portal/submit', t.cookie, { csrf: 'bad' })).status,
    ).toBe(403);
    const done = await send('/portal/submit', t.cookie, { csrf: t.csrf });
    expect(done.headers.get('location')).toBe('/portal?msg=submitted');
    const after = await (await get('/portal?msg=submitted', t.cookie)).text();
    expect(after).toContain('Waiting for the team');
    expect(after).not.toContain('action="/portal/submit"');
    const status = await db
      .prepare('SELECT status, is_published FROM tailor WHERE id = ?')
      .bind(t.tailorId)
      .first();
    expect(status).toEqual({ status: 'draft', is_published: 0 });
    const staff = await (await import('./helpers')).signIn('manager');
    expect(
      await (await get(`/admin/tailors/${t.tailorId}`, staff)).text(),
    ).toContain('please check it and publish');
  });
});
