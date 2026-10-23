import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn, unique } from './helpers';

const addTailor = async (extra: Record<string, string | number> = {}) => {
  const id = (
    await env.DB.prepare(
      'INSERT INTO tailor (slug, display_name, phone_e164) VALUES (?, ?, ?)',
    )
      .bind(`pub-${unique()}`, 'Publish Fake', '+67077123456')
      .run()
  ).meta.last_row_id;
  for (const [column, value] of Object.entries(extra))
    await env.DB.prepare(`UPDATE tailor SET ${column} = ? WHERE id = ?`)
      .bind(value, id)
      .run();
  return id;
};
const row = (id: number) =>
  env.DB.prepare(
    'SELECT status, is_published, permission_recorded, permission_note, contact_publish_consent, verified_fields FROM tailor WHERE id = ?',
  )
    .bind(id)
    .first<Record<string, unknown>>();
const url = (id: number) => `/admin/tailors/${id}/publish`;

describe('publishing through the admin pages', () => {
  it('lets a manager approve, record permission and publish, step by step', async () => {
    const cookie = await signIn('manager');
    const csrf = await csrfOf(cookie);
    const id = await addTailor();
    expect(
      (await post(url(id), cookie, { csrf, action: 'approve' })).headers.get(
        'location',
      ),
    ).toBe(`/admin/tailors/${id}?msg=saved`);
    expect(
      (
        await post(url(id), cookie, {
          csrf,
          action: 'record_permission',
          permission_note: 'Agreed in person',
          permission_date: '2026-10-01',
          contact_publish_consent: 'on',
        })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${id}?msg=saved`);
    expect(
      (await post(url(id), cookie, { csrf, action: 'publish' })).headers.get(
        'location',
      ),
    ).toBe(`/admin/tailors/${id}?msg=published`);
    expect(await row(id)).toMatchObject({
      status: 'approved',
      is_published: 1,
      permission_recorded: 1,
      permission_note: 'Agreed in person',
      contact_publish_consent: 1,
    });
  });

  it('refuses to publish an unqualified tailor and lists plainly what is missing', async () => {
    const cookie = await signIn('manager');
    const csrf = await csrfOf(cookie);
    const id = await addTailor();
    const response = await post(url(id), cookie, { csrf, action: 'publish' });
    expect(response.headers.get('location')).toBe(
      `/admin/tailors/${id}?msg=blocked`,
    );
    const html = await (
      await get(response.headers.get('location')!, cookie)
    ).text();
    expect(html).toContain('Approved by a manager or the owner');
    expect(html).toContain('permission to be listed is recorded');
    // The number is saved: the page must point at the consent box, not claim a number is missing.
    expect(html).toContain('The tailor agrees their number may be shown');
    expect(html).toMatch(
      /check check--done"><div><strong>Done:<\/strong> A WhatsApp or phone number on the profile/,
    );
    expect(html).toContain('href="#contact-consent"');
    expect(html).toContain('The number is saved');
    expect((await row(id))?.is_published).toBe(0);
  });

  it('marks the consent box when a saved number cannot be published without consent', async () => {
    const cookie = await signIn('manager');
    const id = await addTailor({
      status: 'approved',
      permission_recorded: 1,
      contact_publish_consent: 0,
      whatsapp_e164: '+67070000123',
    });
    const html = await (await get(`/admin/tailors/${id}`, cookie)).text();
    expect(html).toContain('id="contact-consent"');
    expect(html).toContain('field-needed');
    expect(html).toContain('Needed before publishing');
    expect(html).not.toContain('id="whatsapp-error"');
  });

  it('shows the publishing section to managers only', async () => {
    const manager = await signIn('manager');
    const editor = await signIn('editor');
    const id = await addTailor();
    expect(await (await get(`/admin/tailors/${id}`, manager)).text()).toContain(
      'name="action" value="publish"',
    );
    const forEditor = await (await get(`/admin/tailors/${id}`, editor)).text();
    expect(forEditor).not.toContain('value="publish"');
    expect(forEditor).not.toContain('record_permission');
  });

  it('refuses without a csrf token, and an editor outright', async () => {
    const manager = await signIn('manager');
    const editor = await signIn('editor');
    const id = await addTailor();
    expect((await post(url(id), manager, { action: 'approve' })).status).toBe(
      403,
    );
    expect((await row(id))?.status).toBe('draft');
    expect(
      (
        await post(url(id), editor, {
          csrf: await csrfOf(editor),
          action: 'approve',
        })
      ).status,
    ).toBe(403);
    expect((await row(id))?.status).toBe('draft');
  });

  it('withdrawing permission unpublishes the tailor', async () => {
    const cookie = await signIn('manager');
    const csrf = await csrfOf(cookie);
    const id = await addTailor({
      status: 'approved',
      permission_recorded: 1,
      contact_publish_consent: 1,
      is_published: 1,
    });
    await post(url(id), cookie, { csrf, action: 'withdraw_permission' });
    expect(await row(id)).toMatchObject({
      is_published: 0,
      permission_recorded: 0,
      contact_publish_consent: 0,
    });
  });

  it('unpublishes on request', async () => {
    const cookie = await signIn('owner');
    const csrf = await csrfOf(cookie);
    const id = await addTailor({
      status: 'approved',
      permission_recorded: 1,
      contact_publish_consent: 1,
      is_published: 1,
    });
    expect(
      (await post(url(id), cookie, { csrf, action: 'unpublish' })).headers.get(
        'location',
      ),
    ).toBe(`/admin/tailors/${id}?msg=unpublished`);
    expect((await row(id))?.is_published).toBe(0);
  });

  it('stores only known verified fields and ignores invented ones', async () => {
    const cookie = await signIn('manager');
    const csrf = await csrfOf(cookie);
    const id = await addTailor();
    await post(url(id), cookie, {
      csrf,
      action: 'set_verified',
      verified_description: 'on',
      verified_languages: 'on',
      verified_rating: 'on',
      verified_award: 'on',
    });
    expect(JSON.parse(String((await row(id))?.verified_fields))).toEqual([
      'description',
      'languages',
    ]);
  });

  it('answers a bad date or unknown action with a message, not an error', async () => {
    const cookie = await signIn('manager');
    const csrf = await csrfOf(cookie);
    const id = await addTailor();
    expect(
      (
        await post(url(id), cookie, {
          csrf,
          action: 'record_permission',
          permission_note: 'x',
          permission_date: '2026-13-40',
        })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${id}?msg=invalid&fields=permission_date`);
    // The exact control is marked, not just the banner.
    const page = await (
      await get(
        `/admin/tailors/${id}?msg=invalid&fields=permission_date`,
        cookie,
      )
    ).text();
    expect(page).toContain('id="permission-date-error"');
    expect(page).toContain('aria-invalid="true"');
    expect(page).toContain('Enter a real date');
    // A rejected profile field is marked too, and a hint keeps its own id.
    const profile = await (
      await get(`/admin/tailors/${id}?msg=invalid&fields=whatsapp`, cookie)
    ).text();
    expect(profile).toContain('id="whatsapp-error"');
    expect(profile).toContain('Enter a Timor-Leste number');
    await env.DB.prepare(
      'UPDATE tailor SET phone_e164 = NULL, whatsapp_e164 = NULL WHERE id = ?',
    )
      .bind(id)
      .run();
    const needed = await (await get(`/admin/tailors/${id}`, cookie)).text();
    expect(needed).toContain('id="whatsapp-hint"');
    expect(needed).not.toContain('id="whatsapp-error"');
    expect(
      (await post(url(id), cookie, { csrf, action: 'explode' })).headers.get(
        'location',
      ),
    ).toBe(`/admin/tailors/${id}?msg=invalid`);
  });

  it('answers 404 for an unknown tailor', async () => {
    const cookie = await signIn('manager');
    expect(
      (
        await post(url(999999), cookie, {
          csrf: await csrfOf(cookie),
          action: 'publish',
        })
      ).status,
    ).toBe(404);
  });
});
