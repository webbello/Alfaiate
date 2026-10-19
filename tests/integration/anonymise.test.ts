import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn, unique } from './helpers';

const db = env.DB;
const enquiry = async () => {
  const reference = `AT-AZ${String(unique()).padStart(6, '0')}`;
  const id = (
    await db
      .prepare(
        "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, notes, consent_shared_with_tailor, consent_text_version, consent_at) VALUES (?, 'Anonymise Fake Customer', '+67077123456', 'phone', 'Anonymise fake notes', 1, 'v', '2026-01-01T00:00:00Z')",
      )
      .bind(reference)
      .run()
  ).meta.last_row_id as number;
  await db
    .prepare(
      "INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status) VALUES (?, NULL, 'new')",
    )
    .bind(id)
    .run();
  return { id, reference };
};
const act = async (
  role: string,
  id: number,
  form: Record<string, string>,
  csrf = true,
) => {
  const cookie = await signIn(role);
  return post(`/admin/enquiries/${id}/anonymise`, cookie, {
    csrf: csrf ? await csrfOf(cookie) : 'bad',
    ...form,
  });
};
const stored = (id: number) =>
  db
    .prepare('SELECT customer_name, anonymised_at FROM enquiry WHERE id = ?')
    .bind(id)
    .first<{ customer_name: string | null; anonymised_at: string | null }>();

describe('anonymising an enquiry from the admin (PRV-04, FR-ADM-09, SEC-09)', () => {
  it('lets the owner do it with the reference code typed, and shows the result', async () => {
    const e = await enquiry();
    const r = await act('owner', e.id, { confirm_reference: e.reference });
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe(
      `/admin/enquiries/${e.id}?msg=anonymised`,
    );
    expect(await stored(e.id)).toMatchObject({ customer_name: null });
    const owner = await signIn('owner');
    const html = await (await get(`/admin/enquiries/${e.id}`, owner)).text();
    expect(html).toContain('(anonymised)');
    expect(html).not.toContain('Anonymise Fake Customer');
    expect(html).not.toContain(`/admin/enquiries/${e.id}/anonymise`); // no form any more
    const list = await (
      await get('/admin/enquiries?q=Anonymise+Fake', owner)
    ).text();
    expect(list).not.toContain(e.reference);
  });

  it('refuses a wrong or missing confirmation and changes nothing', async () => {
    const e = await enquiry();
    for (const typed of ['', 'AT-WRONG', 'yes']) {
      const r = await act('owner', e.id, { confirm_reference: typed });
      expect(r.headers.get('location'), typed).toBe(
        `/admin/enquiries/${e.id}?msg=anonymise_wrong_reference`,
      );
    }
    expect((await stored(e.id))!.customer_name).toBe('Anonymise Fake Customer');
  });

  it('is refused for managers, editors, viewers and anonymous visitors, and without a valid CSRF token', async () => {
    const e = await enquiry();
    for (const role of ['manager', 'editor', 'viewer'])
      expect(
        (await act(role, e.id, { confirm_reference: e.reference })).status,
        role,
      ).toBe(403);
    expect(
      (await act('owner', e.id, { confirm_reference: e.reference }, false))
        .status,
    ).toBe(403);
    expect(
      (
        await post(`/admin/enquiries/${e.id}/anonymise`, undefined, {
          confirm_reference: e.reference,
        })
      ).status,
    ).toBe(302);
    expect((await stored(e.id))!.customer_name).toBe('Anonymise Fake Customer');
  });

  it('answers 404 for an unknown or malformed id, and a second request is a harmless no-op', async () => {
    expect(
      (await act('owner', 999_999, { confirm_reference: 'AT-X' })).status,
    ).toBe(404);
    expect((await act('owner', 0, { confirm_reference: 'AT-X' })).status).toBe(
      404,
    );
    const e = await enquiry();
    await act('owner', e.id, { confirm_reference: e.reference });
    const again = await act('owner', e.id, { confirm_reference: e.reference });
    expect(again.headers.get('location')).toBe(
      `/admin/enquiries/${e.id}?msg=already_anonymised`,
    );
  });

  it('shows the form to the owner only, with the reference to type', async () => {
    const e = await enquiry();
    const owner = await (
      await get(`/admin/enquiries/${e.id}`, await signIn('owner'))
    ).text();
    expect(owner).toContain(`/admin/enquiries/${e.id}/anonymise`);
    expect(owner).toContain('name="confirm_reference"');
    expect(owner).toContain(e.reference);
    const manager = await (
      await get(`/admin/enquiries/${e.id}`, await signIn('manager'))
    ).text();
    expect(manager).not.toContain('/anonymise');
    expect(manager).not.toContain('confirm_reference');
  });
});
