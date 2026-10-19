import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, csrfOf, get, post, signIn, unique } from './helpers';
import { worker } from './worker';
import { issueToken } from '../../src/modules/enquiry/spam';

// Phase 7c T7 (FR-JOIN-01..03): the tailor interest form is a public, noindex, protected form that stores a call-list record and nothing else.
const db = env.DB;
const SECRET = 'integration-form-secret-0123456789';
const count = async (table: string) =>
  (await db
    .prepare(`SELECT count(*) AS n FROM ${table}`)
    .first<{ n: number }>())!.n;
const send = async (
  path: string,
  over: Record<string, string> = {},
  init: { origin?: string | null; ip?: string } = {},
) => {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    'cf-connecting-ip': init.ip ?? `198.51.101.${unique() % 250}`,
  };
  if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
  return worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        form_token: await issueToken(SECRET, new Date(Date.now() - 10_000)),
        name: 'Join Fake',
        phone: '7712 3456',
        consent: 'yes',
        ...over,
      }),
      redirect: 'manual',
    }),
  );
};

describe('GET /join', () => {
  it('is a noindex, uncached form with labelled fields, the honeypot, a token and an unticked consent box', async () => {
    const r = await get('/join');
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('name="robots" content="noindex,follow"');
    expect(html).toContain('This is not a sign-up');
    for (const name of [
      'name',
      'business',
      'phone',
      'area',
      'craft',
      'message',
      'consent',
      'form_token',
      'extra_info',
    ])
      expect(html, name).toContain(`name="${name}"`);
    expect(html).toMatch(/<input[^>]*name="consent"(?![^>]*checked)[^>]*>/);
    for (const id of ['name', 'phone', 'consent'])
      expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"`));
    expect(html).not.toMatch(
      /<script(?![^>]*(src=|type="application\/ld\+json"))/,
    );
  });
  it('has a Tetum twin with its own links, and is not in the sitemap', async () => {
    const html = await (await get('/tet/join')).text();
    expect(html).toContain('<html lang="tet">');
    expect(html).toContain('action="/tet/join"');
    expect(await (await get('/sitemap.xml')).text()).not.toContain('/join');
  });
});

describe('POST /join', () => {
  it('stores one record, redirects with only a JN reference, and creates no tailor or account', async () => {
    const before = {
      i: await count('tailor_interest'),
      t: await count('tailor'),
      u: await count('admin_user'),
    };
    const r = await send('/join', { business: 'Join Atelier Fake' });
    expect(r.status).toBe(303);
    const location = r.headers.get('location')!;
    expect(location).toMatch(/^\/join\/thanks\?ref=JN-[A-HJ-NP-Z2-9]{8}$/);
    expect(location).not.toMatch(/Join|7712|3456/);
    expect(await count('tailor_interest')).toBe(before.i + 1);
    expect(await count('tailor')).toBe(before.t);
    expect(await count('admin_user')).toBe(before.u);
    const thanks = await (await get(location)).text();
    expect(thanks).toContain(location.split('=')[1]);
    expect(thanks).not.toContain('Join Fake');
    expect(thanks).toContain('name="robots" content="noindex,follow"');
  });
  it('records the Tetum consent version on the Tetum page', async () => {
    const r = await send('/tet/join');
    expect(r.headers.get('location')).toMatch(/^\/tet\/join\/thanks\?ref=JN-/);
    const row = await db
      .prepare(
        'SELECT consent_text_version FROM tailor_interest ORDER BY id DESC LIMIT 1',
      )
      .first<{ consent_text_version: string }>();
    expect(row!.consent_text_version).toBe('consent-join-2026-10-v1-tet');
  });
  it('shows field errors, keeps the typed text (not the tick), escapes it, and stores nothing', async () => {
    const before = await count('tailor_interest');
    const r = await send('/join', {
      name: '',
      consent: '',
      message: '<script>alert(1)</script> keep',
    });
    const html = await r.text();
    expect(r.status).toBe(400);
    expect(await count('tailor_interest')).toBe(before);
    expect(html).toContain('role="alert"');
    for (const id of ['name', 'consent'])
      expect(html).toContain(`id="${id}-error"`);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toMatch(/<input[^>]*name="consent"[^>]*checked/);
  });
  it('refuses a cross-origin or origin-less post', async () => {
    const before = await count('tailor_interest');
    expect(
      (await send('/join', {}, { origin: 'https://evil.example' })).status,
    ).toBe(403);
    expect((await send('/join', {}, { origin: null })).status).toBe(403);
    expect(await count('tailor_interest')).toBe(before);
  });
  it('answers 429 after five tries from one address', async () => {
    const ip = '198.51.102.7';
    for (let i = 0; i < 5; i++)
      expect((await send('/join', {}, { ip })).status).toBe(303);
    expect((await send('/join', {}, { ip })).status).toBe(429);
  });
  it('sends a missing or malformed reference back to the form and never echoes it', async () => {
    for (const path of [
      '/join/thanks',
      '/join/thanks?ref=<script>',
      '/tet/join/thanks?ref=AT-ABCDEFGH',
    ]) {
      const r = await get(path);
      expect(r.status, path).toBe(303);
      expect(r.headers.get('location')).toMatch(/\/join$/);
    }
  });
});

describe('admin list (FR-JOIN-03)', () => {
  const addRow = async (name: string) => {
    const ref = `JN-T${unique()}`.padEnd(11, 'A');
    const id = (
      await db
        .prepare(
          "INSERT INTO tailor_interest (reference_code, contact_name, phone_e164, business_name, consent_contact, consent_text_version, consent_at) VALUES (?, ?, '+67077123456', 'List Biz Fake', 1, 'v', 'now')",
        )
        .bind(ref, name)
        .run()
    ).meta.last_row_id as number;
    return { id, ref };
  };
  it('is closed to anonymous visitors and to roles without tailor.edit, and open to the others', async () => {
    expect((await get('/admin/interest')).status).toBe(302);
    expect((await get('/admin/interest', await signIn('viewer'))).status).toBe(
      403,
    );
    for (const role of ['editor', 'manager', 'owner'])
      expect(
        (await get('/admin/interest', await signIn(role))).status,
        role,
      ).toBe(200);
  });
  it('lists records with details for editors, but only the owner gets the remove form', async () => {
    const { id, ref } = await addRow('List Name Fake');
    const editor = await (
      await get('/admin/interest', await signIn('editor'))
    ).text();
    expect(editor).toContain('List Name Fake');
    expect(editor).toContain('+67077123456');
    expect(editor).not.toContain(`/admin/interest/${id}/anonymise`);
    const owner = await (
      await get('/admin/interest', await signIn('owner'))
    ).text();
    expect(owner).toContain(`action="/admin/interest/${id}/anonymise"`);
    expect(owner).toContain(ref);
  });
  it('removing details needs the owner, the CSRF token and the typed reference', async () => {
    const { id, ref } = await addRow('Remove Me Fake');
    const manager = await signIn('manager');
    const denied = await post(`/admin/interest/${id}/anonymise`, manager, {
      csrf: await csrfOf(manager),
      confirm_reference: ref,
    });
    expect(denied.status).toBe(403);
    const owner = await signIn('owner');
    const wrong = await post(`/admin/interest/${id}/anonymise`, owner, {
      csrf: await csrfOf(owner),
      confirm_reference: 'JN-NOPE',
    });
    expect(wrong.headers.get('location')).toBe(
      '/admin/interest?msg=interest_wrong_reference',
    );
    const noCsrf = await post(`/admin/interest/${id}/anonymise`, owner, {
      csrf: 'bad',
      confirm_reference: ref,
    });
    expect(noCsrf.status).toBe(403);
    const ok = await post(`/admin/interest/${id}/anonymise`, owner, {
      csrf: await csrfOf(owner),
      confirm_reference: ref,
    });
    expect(ok.headers.get('location')).toBe(
      '/admin/interest?msg=interest_anonymised',
    );
    const row = await db
      .prepare(
        'SELECT contact_name, phone_e164 FROM tailor_interest WHERE id = ?',
      )
      .bind(id)
      .first();
    expect(row).toEqual({ contact_name: null, phone_e164: null });
  });
  it('never appears on a public page', async () => {
    await addRow('Public Leak Fake');
    for (const path of ['/', '/tailors', '/request', '/join', '/sitemap.xml'])
      expect(await (await get(path)).text(), path).not.toContain(
        'Public Leak Fake',
      );
  });
});
