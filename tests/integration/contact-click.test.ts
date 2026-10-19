import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, get, unique } from './helpers';
import { worker } from './worker';

const db = env.DB;
const tailor = async (
  o: { published?: boolean; consent?: boolean; whatsapp?: string | null } = {},
) => {
  const slug = `ci-${unique()}`;
  const id = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, whatsapp_e164, phone_e164, status, is_published, permission_recorded, contact_publish_consent) VALUES (?, 'Click Fake', ?, '+67033123456', ?, ?, ?, ?)",
      )
      .bind(
        slug,
        o.whatsapp === undefined ? '+67077123456' : o.whatsapp,
        (o.published ?? true) ? 'approved' : 'draft',
        (o.published ?? true) ? 1 : 0,
        (o.published ?? true) ? 1 : 0,
        (o.consent ?? true) ? 1 : 0,
      )
      .run()
  ).meta.last_row_id;
  return { id, slug };
};
const count = async (id: number, channel: string) =>
  (await db
    .prepare(
      'SELECT coalesce(sum(count), 0) AS c FROM contact_click_daily WHERE tailor_id = ? AND channel = ?',
    )
    .bind(id, channel)
    .first<{ c: number }>())!.c;
const send = (
  body: BodyInit | null,
  init: {
    origin?: string | null;
    method?: string;
    ip?: string;
    type?: string;
  } = {},
) => {
  const headers: Record<string, string> = {
    'cf-connecting-ip': init.ip ?? `198.51.100.${unique() % 250}`,
    'content-type': init.type ?? 'application/json',
  };
  if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
  return worker.fetch(
    new Request(`${ORIGIN}/api/contact-click`, {
      method: init.method ?? 'POST',
      headers,
      body,
    }),
  );
};
const tap = (slug: string, channel: string, init = {}) =>
  send(JSON.stringify({ slug, channel }), init);

describe('POST /api/contact-click (ANA-02)', () => {
  it('counts a tap on a published tailor and answers 204 with no body and no cookie', async () => {
    const t = await tailor();
    const response = await tap(t.slug, 'whatsapp');
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await count(t.id, 'whatsapp')).toBe(1);
    await tap(t.slug, 'phone');
    await tap(t.slug, 'phone');
    expect(await count(t.id, 'phone')).toBe(2);
  });

  it('refuses requests from another origin, or without an origin (cross-site inflation)', async () => {
    const t = await tailor();
    expect(
      (await tap(t.slug, 'phone', { origin: 'https://evil.test' })).status,
    ).toBe(403);
    expect((await tap(t.slug, 'phone', { origin: null })).status).toBe(403);
    expect(
      (await tap(t.slug, 'phone', { origin: `${ORIGIN}.evil.test` })).status,
    ).toBe(403);
    expect(await count(t.id, 'phone')).toBe(0);
  });

  it('refuses taps for unpublished tailors, tailors who did not consent and channels they lack', async () => {
    const draft = await tailor({ published: false });
    const noConsent = await tailor({ consent: false });
    const noWhatsapp = await tailor({ whatsapp: null });
    expect((await tap(draft.slug, 'phone')).status).toBe(404);
    expect((await tap(noConsent.slug, 'phone')).status).toBe(404);
    expect((await tap(noWhatsapp.slug, 'whatsapp')).status).toBe(404);
    expect((await tap('no-such-tailor', 'phone')).status).toBe(404);
    for (const t of [draft, noConsent, noWhatsapp])
      expect(
        (await count(t.id, 'whatsapp')) + (await count(t.id, 'phone')),
      ).toBe(0);
  });

  it('answers 400 for malformed input and 413 for a large body, without counting', async () => {
    const t = await tailor();
    expect((await tap(t.slug, 'email')).status).toBe(400);
    expect((await send('not json')).status).toBe(400);
    expect((await send('null')).status).toBe(400);
    expect(
      (await send(JSON.stringify({ slug: 5, channel: 'phone' }))).status,
    ).toBe(400);
    expect(
      (
        await send(
          JSON.stringify({
            slug: t.slug,
            channel: 'phone',
            pad: 'x'.repeat(5000),
          }),
        )
      ).status,
    ).toBe(413);
    expect((await tap("x' OR 1=1 --", 'phone')).status).toBe(400);
    expect(await count(t.id, 'phone')).toBe(0);
  });

  it('answers 429 once an address has tapped too often', async () => {
    const t = await tailor();
    const ip = '203.0.113.250';
    let last = 204;
    for (let i = 0; i < 70; i++)
      last = (await tap(t.slug, 'phone', { ip })).status;
    expect(last).toBe(429);
    expect(await count(t.id, 'phone')).toBe(60);
  });

  it('is POST only', async () => {
    const t = await tailor();
    expect((await send(null, { method: 'GET' })).status).toBeGreaterThanOrEqual(
      400,
    );
    expect((await get('/api/contact-click')).status).toBeGreaterThanOrEqual(
      400,
    );
    expect(await count(t.id, 'phone')).toBe(0);
  });
});

describe('the beacon script on profile pages', () => {
  it('loads from an external file on a profile that has contact buttons, and not on one that has none', async () => {
    const withContacts = await tailor();
    const html = await (await get(`/tailors/${withContacts.slug}`)).text();
    const src = html.match(/<script[^>]*\bsrc="([^"]+)"/)?.[1];
    expect(src).toBeTruthy();
    expect(html).not.toMatch(
      /<script(?![^>]*(src=|type="application\/ld\+json"))/,
    );
    const script = await worker.fetch(new Request(`${ORIGIN}${src}`));
    expect(script.status).toBe(200);
    const code = await script.text();
    expect(code).toContain('sendBeacon');
    expect(code).toContain('/api/contact-click');

    const bare = await tailor({ consent: false });
    // only the structured-data block remains: no beacon script and no other script
    const bareHtml = await (await get(`/tailors/${bare.slug}`)).text();
    expect(bareHtml).not.toMatch(
      /<script(?![^>]*type="application\/ld\+json")/,
    );
    expect(bareHtml).not.toContain('contact-click');
  });
});
