import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn, unique } from './helpers';

const addTailor = async () =>
  (
    await env.DB.prepare(
      "INSERT INTO tailor (slug, display_name, fee_terms_text, fee_terms_agreed_on) VALUES (?, 'Fee Page Fake', 'SECRET-FEE-WORDING', '2026-05-05')",
    )
      .bind(`fp-${unique()}`)
      .run()
  ).meta.last_row_id;
const url = (id: number) => `/admin/tailors/${id}/fees`;

describe('fee terms (owner only)', () => {
  it('lets the owner read and change them', async () => {
    const owner = await signIn('owner');
    const csrf = await csrfOf(owner);
    const id = await addTailor();
    expect(await (await get(`/admin/tailors/${id}`, owner)).text()).toContain(
      'SECRET-FEE-WORDING',
    );
    const saved = await post(url(id), owner, {
      csrf,
      fee_terms_text: 'New agreed terms',
      fee_terms_agreed_on: '2026-10-10',
    });
    expect(saved.headers.get('location')).toBe(
      `/admin/tailors/${id}?msg=saved`,
    );
    expect(
      await env.DB.prepare('SELECT fee_terms_text FROM tailor WHERE id = ?')
        .bind(id)
        .first(),
    ).toEqual({ fee_terms_text: 'New agreed terms' });
  });

  it('never shows the terms to a manager or editor, and refuses their posts', async () => {
    const id = await addTailor();
    for (const role of ['manager', 'editor']) {
      const cookie = await signIn(role);
      const html = await (await get(`/admin/tailors/${id}`, cookie)).text();
      expect(html, role).not.toContain('SECRET-FEE-WORDING');
      expect(html, role).not.toContain('2026-05-05');
      expect(
        (
          await post(url(id), cookie, {
            csrf: await csrfOf(cookie),
            fee_terms_text: 'x',
          })
        ).status,
        role,
      ).toBe(403);
    }
    expect(
      (
        await env.DB.prepare('SELECT fee_terms_text FROM tailor WHERE id = ?')
          .bind(id)
          .first<{ fee_terms_text: string }>()
      )?.fee_terms_text,
    ).toBe('SECRET-FEE-WORDING');
  });

  it('needs the csrf token', async () => {
    const owner = await signIn('owner');
    const id = await addTailor();
    expect((await post(url(id), owner, { fee_terms_text: 'x' })).status).toBe(
      403,
    );
  });

  it('does not appear in the tailor list', async () => {
    const owner = await signIn('owner');
    await addTailor();
    expect(await (await get('/admin/tailors', owner)).text()).not.toContain(
      'SECRET-FEE-WORDING',
    );
  });

  it('answers a bad date with a message', async () => {
    const owner = await signIn('owner');
    const id = await addTailor();
    expect(
      (
        await post(url(id), owner, {
          csrf: await csrfOf(owner),
          fee_terms_text: 'x',
          fee_terms_agreed_on: '2026-13-01',
        })
      ).headers.get('location'),
    ).toBe(`/admin/tailors/${id}?msg=invalid`);
  });
});
