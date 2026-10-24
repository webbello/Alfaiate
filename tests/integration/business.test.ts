import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, csrfOf, get, post, signIn, unique } from './helpers';
import { worker } from './worker';
import { issueToken } from '../../src/modules/enquiry/spam';

// Phase 7d (FR-ENQ-09): business, school and organisation enquiries reuse the request workflow with two more fields.
const db = env.DB;
const SECRET = 'integration-form-secret-0123456789';
const send = async (path: string, over: Record<string, string> = {}) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        'cf-connecting-ip': `198.51.103.${unique() % 250}`,
      },
      body: new URLSearchParams({
        form_token: await issueToken(SECRET, new Date(Date.now() - 10_000)),
        name: 'Biz Contact Fake',
        phone: '7712 3456',
        channel: 'whatsapp',
        consent: 'yes',
        organisation: 'Escola Fake',
        group_size: '30 shirts',
        ...over,
      }),
      redirect: 'manual',
    }),
  );
const latest = () =>
  db
    .prepare(
      'SELECT e.*, b.organisation_name, b.group_size_text FROM enquiry e LEFT JOIN enquiry_business b ON b.enquiry_id = e.id ORDER BY e.id DESC LIMIT 1',
    )
    .first<Record<string, unknown>>();

describe('the business form', () => {
  it('is the request form with an organisation field, its own heading and action, noindex, in both languages', async () => {
    const html = await (await get('/business')).text();
    expect(html).toContain('Made for teams, schools and businesses');
    expect(html).toContain('action="/business"');
    expect(html).toMatch(/<input[^>]*name="organisation"[^>]*required/);
    expect(html).toContain('name="group_size"');
    expect(html).toContain('name="robots" content="noindex,follow"');
    expect(await (await get('/tet/business')).text()).toContain(
      'action="/tet/business"',
    );
    expect(await (await get('/request')).text()).not.toContain(
      'name="organisation"',
    );
  });
  it('stores a business enquiry with source business and the two fields, then shows the usual acknowledgement', async () => {
    const r = await send('/business');
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toMatch(/^\/request\/thanks\?ref=AT-/);
    expect(await latest()).toMatchObject({
      source: 'business',
      organisation_name: 'Escola Fake',
      group_size_text: '30 shirts',
      customer_name: 'Biz Contact Fake',
    });
  });
  it('requires the organisation and stores nothing without it', async () => {
    const before = (await db
      .prepare('SELECT count(*) AS n FROM enquiry')
      .first<{ n: number }>())!.n;
    const r = await send('/business', { organisation: '' });
    expect(r.status).toBe(400);
    expect(await r.text()).toContain('id="organisation-error"');
    expect(
      (await db
        .prepare('SELECT count(*) AS n FROM enquiry')
        .first<{ n: number }>())!.n,
    ).toBe(before);
  });
  it('ignores organisation fields posted to the ordinary request form', async () => {
    await send('/request', { organisation: 'Sneaky Org Fake' });
    expect(await latest()).toMatchObject({
      source: 'form',
      organisation_name: null,
      group_size_text: null,
    });
  });
  it('shows the organisation to the owner and in the forwarding text, and anonymising removes it', async () => {
    await send('/business', { organisation: 'Anon Org Fake' });
    const row = (await latest())!;
    const owner = await signIn('owner');
    const page = await (await get(`/admin/enquiries/${row.id}`, owner)).text();
    expect(page).toContain('Anon Org Fake');
    expect(page).toMatch(/Organisation: Anon Org Fake/);
    const r = await post(`/admin/enquiries/${row.id}/anonymise`, owner, {
      csrf: await csrfOf(owner),
      confirm_reference: String(row.reference_code),
    });
    expect(r.status).toBe(303);
    expect(
      await db
        .prepare(
          'SELECT count(*) AS n FROM enquiry_business WHERE enquiry_id = ?',
        )
        .bind(row.id)
        .first(),
    ).toEqual({ n: 0 });
  });
});
