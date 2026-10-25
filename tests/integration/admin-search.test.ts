import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn, unique } from './helpers';

// FR-ADM-14: one admin search over requests, tailors and shop orders; each source only for roles that may open its list; typed text never in an address.
const run = (sql: string, ...args: (string | number | null)[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();
const search = async (cookie: string, q: string) =>
  post('/admin/search', cookie, { csrf: await csrfOf(cookie), q });

async function seed() {
  const n = String(unique()).padStart(6, '0');
  const ref = `AT-S${n}XY`.slice(0, 11);
  const id = (
    await run(
      "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status) VALUES (?, ?, '+67070005678', 'phone', 1, 'v1', '2026-01-01T00:00:00Z', 'new')",
      ref,
      `Srchfake Customer${n}`,
    )
  ).meta.last_row_id;
  const spam = `AT-X${n}XY`.slice(0, 11);
  await run(
    "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status, is_spam) VALUES (?, 'Spamfake Person', '+67070005679', 'phone', 1, 'v1', '2026-01-01T00:00:00Z', 'new', 1)",
    spam,
  );
  const tailor = (
    await run(
      "INSERT INTO tailor (slug, display_name, whatsapp_e164) VALUES (?, ?, '+67070006789')",
      `srch-${n}`,
      `Srchfake Tailor${n}`,
    )
  ).meta.last_row_id;
  const order = `OR-S${n}`.slice(0, 11).padEnd(11, '0');
  await run(
    "INSERT INTO shop_order (reference_code, total_cents, items_json, routes_json) VALUES (?, 100, '[]', '[]')",
    order,
  );
  return { n, ref, id, spam, tailor, order };
}

describe('admin search', () => {
  it('finds a request by reference, name and phone, a tailor by name and phone, and an order by reference', async () => {
    const s = await seed();
    const owner = await signIn('owner');
    const html = async (q: string) => await (await search(owner, q)).text();
    expect(await html(s.ref)).toContain(`href="/admin/enquiries/${s.id}"`);
    expect(await html(`Customer${s.n}`)).toContain(s.ref);
    expect(await html('70005678')).toContain(s.ref);
    expect(await html('+670 7000 5678')).toContain(s.ref);
    expect(await html(`Tailor${s.n}`)).toContain(
      `href="/admin/tailors/${s.tailor}"`,
    );
    expect(await html('70006789')).toContain(
      `href="/admin/tailors/${s.tailor}"`,
    );
    expect(await html(s.order)).toContain(s.order);
    expect(await html(s.spam)).not.toContain('Spamfake'); // spam is not a request to answer (the typed text is echoed in the box, the result is not)
  });

  it('gives each role only the sources whose lists it may open', async () => {
    const s = await seed();
    const manager = await (await search(await signIn('manager'), s.n)).text();
    expect(manager).toContain(s.ref);
    expect(manager).toContain(`Srchfake Tailor${s.n}`);
    const editorCookie = await signIn('editor');
    const editor = await (await search(editorCookie, s.n)).text();
    expect(editor).toContain(`Srchfake Tailor${s.n}`);
    expect(editor).not.toContain(s.ref);
    expect(editor).not.toContain(`Srchfake Customer${s.n}`);
    expect(editor).not.toContain('Shop orders');
    const viewerCookie = await signIn('viewer');
    const viewer = await (await search(viewerCookie, s.n)).text();
    expect(viewer).toContain('Your role cannot search');
    expect(viewer).not.toContain(s.ref);
    expect(viewer).not.toContain('class="admin-search"');
  });

  it('is a POST in the top bar, needs sign-in and a CSRF token, and survives hostile text', async () => {
    const owner = await signIn('owner');
    const bar = await (await get('/admin', owner)).text();
    expect(bar).toMatch(
      /<form[^>]*class="admin-search"[^>]*method="post"|<form[^>]*method="post"[^>]*class="admin-search"/,
    );
    const anonymous = await post('/admin/search', undefined, {
      csrf: 'x',
      q: 'a',
    });
    expect([302, 303, 401, 403]).toContain(anonymous.status);
    expect((await anonymous.text()).includes('Srchfake')).toBe(false);
    const noToken = await post('/admin/search', owner, { q: 'a' });
    expect(noToken.status).toBe(403);
    for (const q of [
      '%',
      '_',
      '\\',
      '😀😀😀😀😀😀😀😀😀😀😀😀😀😀',
      'x'.repeat(300),
      "'; DROP TABLE enquiry; --",
    ])
      expect((await search(owner, q)).status, q).toBe(200);
  });
});
