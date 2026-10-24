import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, get, unique } from './helpers';
import { worker } from './worker';
import { issueToken } from '../../src/modules/enquiry/spam';

const db = env.DB;
const SECRET = 'integration-form-secret-0123456789';
const oldToken = () => issueToken(SECRET, new Date(Date.now() - 10_000));
const rows = async () =>
  (await db
    .prepare('SELECT count(*) AS c FROM enquiry')
    .first<{ c: number }>())!.c;
const enquiry = (ref: string) =>
  db
    .prepare('SELECT * FROM enquiry WHERE reference_code = ?')
    .bind(ref)
    .first<Record<string, unknown>>();

const fields = (over: Record<string, string> = {}) => ({
  name: 'Fake Customer',
  phone: '7712 3456',
  channel: 'whatsapp',
  consent: 'yes',
  ...over,
});
const send = async (
  path: string,
  body: Record<string, string> | string,
  init: { ip?: string; origin?: string | null; token?: string | null } = {},
) => {
  const form =
    typeof body === 'string'
      ? body
      : new URLSearchParams({
          form_token:
            init.token === undefined ? await oldToken() : (init.token ?? ''),
          ...body,
        }).toString();
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    'cf-connecting-ip': init.ip ?? `198.51.100.${unique() % 250}`,
  };
  if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
  return worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers,
      body: form,
      redirect: 'manual',
    }),
  );
};
const refOf = (r: Response) =>
  new URL(r.headers.get('location')!, ORIGIN).searchParams.get('ref')!;

describe('GET /request (FR-ENQ-01/02/03, AC-06)', () => {
  it('shows a labelled form with an unticked consent box, the disclaimer beside the button, and no cookie or caching', async () => {
    const response = await get('/request');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('name="robots" content="noindex,follow"');
    for (const name of [
      'name',
      'phone',
      'channel',
      'category',
      'service',
      'area',
      'when',
      'notes',
      'consent',
      'form_token',
      'extra_info',
    ])
      expect(html, name).toMatch(new RegExp(`name="${name}"`));
    expect(html).toMatch(/<input[^>]*name="consent"(?![^>]*checked)[^>]*>/);
    expect(html).toContain('not a confirmed appointment');
    expect(html.indexOf('not a confirmed appointment')).toBeLessThan(
      html.indexOf('type="submit"', html.indexOf('<main')),
    );
    expect(html).toContain('href="/privacy"');
    expect(html).not.toMatch(
      /<script(?![^>]*(src=|type="application\/ld\+json"))/,
    );
    for (const id of ['name', 'phone', 'consent'])
      expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"`));
  });

  it('is available in Tetum with its own links', async () => {
    const html = await (await get('/tet/request')).text();
    expect(html).toContain('<html lang="tet">');
    expect(html).toContain('href="/tet/privacy"');
    expect(html).toContain('action="/tet/request"');
  });

  it('names a published tailor when started from a profile, and ignores any other value', async () => {
    const slug = `rq-${unique()}`;
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES (?, 'Preselect Fake', 'approved', 1, 1, 1, '+67033123456')",
      )
      .bind(slug)
      .run();
    const html = await (await get(`/request?tailor=${slug}`)).text();
    expect(html).toContain('Preselect Fake');
    expect(html).toContain(`name="tailor" value="${slug}"`);
    const draft = `rq-${unique()}`;
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name) VALUES (?, 'Unpublished Fake Name')",
      )
      .bind(draft)
      .run();
    expect(await (await get(`/request?tailor=${draft}`)).text()).not.toContain(
      'Unpublished Fake Name',
    );
    for (const bad of [
      'no-such-tailor',
      "x'><script>alert(1)</script>",
      '../admin',
    ]) {
      const other = await (
        await get(`/request?tailor=${encodeURIComponent(bad)}`)
      ).text();
      expect(other).not.toContain('Preselect Fake');
      expect(other).not.toContain('name="tailor"');
      expect(other).not.toContain('<script>alert');
    }
  });
});

describe('POST /request (AC-06, AC-07)', () => {
  it('stores one new enquiry, records consent version and time, and redirects with only the reference code', async () => {
    const before = await rows();
    const r = await send('/request', fields({ notes: 'Fake private notes' }));
    expect(r.status).toBe(303);
    const location = r.headers.get('location')!;
    expect(location).toMatch(/^\/request\/thanks\?ref=AT-[A-HJ-NP-Z2-9]{8}$/);
    expect(location).not.toMatch(/Fake|7712|670|notes/i);
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(await rows()).toBe(before + 1);
    const e = await enquiry(refOf(r));
    expect(e).toMatchObject({
      customer_name: 'Fake Customer',
      contact_number_e164: '+67077123456',
      status: 'new',
      consent_text_version: 'consent-2026-10-v1-en',
      source: 'form',
      notes: 'Fake private notes',
    });
    expect(String(e!.consent_at)).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it('works in Tetum and records the Tetum consent version', async () => {
    const r = await send('/tet/request', fields());
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toMatch(
      /^\/tet\/request\/thanks\?ref=AT-/,
    );
    expect((await enquiry(refOf(r)))!.consent_text_version).toBe(
      'consent-2026-10-v1-tet',
    );
  });

  it('records a preselected published tailor, and ignores an unpublished one', async () => {
    const slug = `rq-${unique()}`;
    const t = (
      await db
        .prepare(
          "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164) VALUES (?, 'P', 'approved', 1, 1, 1, '+67033123456')",
        )
        .bind(slug)
        .run()
    ).meta.last_row_id;
    const good = await send('/request', fields({ tailor: slug }));
    expect(await enquiry(refOf(good))).toMatchObject({
      preferred_tailor_id: t,
      source: `profile:${slug}`,
    });
    const draft = `rq-${unique()}`;
    await db
      .prepare("INSERT INTO tailor (slug, display_name) VALUES (?, 'D')")
      .bind(draft)
      .run();
    const bad = await send('/request', fields({ tailor: draft }));
    expect(await enquiry(refOf(bad))).toMatchObject({
      preferred_tailor_id: null,
      source: 'form',
    });
  });

  it('shows field-level errors, keeps what was typed (not the consent tick) and stores nothing', async () => {
    const before = await rows();
    const r = await send(
      '/request',
      fields({
        name: '',
        phone: '123',
        consent: '',
        notes: 'keep these words',
      }),
    );
    const html = await r.text();
    expect(r.status).toBe(400);
    expect(await rows()).toBe(before);
    expect(html).toContain('role="alert"');
    for (const id of ['name', 'phone', 'consent'])
      expect(html).toContain(`id="${id}-error"`);
    expect(html).toMatch(/aria-describedby="[^"]*phone-error/);
    expect(html).toContain('keep these words');
    expect(html).toContain('value="123"');
    expect(html).not.toMatch(/<input[^>]*name="consent"[^>]*checked/);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('escapes hostile input when showing the form again', async () => {
    const r = await send(
      '/request',
      fields({ name: '', notes: '"><script>alert(1)</script>' }),
    );
    const html = await r.text();
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuses a choice that is not in the active lists', async () => {
    const before = await rows();
    const r = await send('/request', fields({ category: '999999' }));
    expect(r.status).toBe(400);
    expect(await rows()).toBe(before);
  });
});

describe('spam controls (SEC-07, AC-08)', () => {
  it('a filled honeypot looks like success but stores nothing', async () => {
    const before = await rows();
    const r = await send(
      '/request',
      fields({ extra_info: 'http://spam.test' }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toMatch(/\/request\/thanks\?ref=AT-/);
    expect(await enquiry(refOf(r))).toBeNull();
    expect(await rows()).toBe(before);
  });

  it('a submission under 3 seconds, a missing token and an expired token store nothing and keep the input', async () => {
    const before = await rows();
    const html = await (await get('/request')).text();
    const fresh = html.match(/name="form_token" value="([^"]+)"/)![1];
    const fast = await send('/request', fields({ notes: 'typed fast' }), {
      token: fresh,
    });
    expect(fast.status).toBe(400);
    expect(await fast.text()).toContain('typed fast');
    expect((await send('/request', fields(), { token: null })).status).toBe(
      400,
    );
    const expired = await issueToken(
      SECRET,
      new Date(Date.now() - 25 * 3600 * 1000),
    );
    expect((await send('/request', fields(), { token: expired })).status).toBe(
      400,
    );
    expect(await rows()).toBe(before);
  });

  it('answers 429 after 5 tries from one address, stores nothing for them, and a normal request from another address still works', async () => {
    const ip = '203.0.113.201';
    for (let i = 0; i < 5; i++)
      expect((await send('/request', fields(), { ip })).status).toBe(303);
    const before = await rows();
    const limited = await send('/request', fields(), { ip });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('location')).toBeNull();
    expect(await rows()).toBe(before);
    expect(
      (await send('/request', fields(), { ip: '203.0.113.202' })).status,
    ).toBe(303);
  });

  it('refuses a cross-origin or origin-less post and an oversized body', async () => {
    const before = await rows();
    expect(
      (await send('/request', fields(), { origin: 'https://evil.test' }))
        .status,
    ).toBe(403);
    expect((await send('/request', fields(), { origin: null })).status).toBe(
      403,
    );
    const big = await send('/request', fields({ notes: 'x'.repeat(100_000) }));
    expect(big.status).toBe(413);
    expect(await rows()).toBe(before);
  });
});

describe('failures are never shown as success', () => {
  it('shows an error page, not the acknowledgement, when the database refuses the insert', async () => {
    await db.exec(
      "CREATE TRIGGER rq_fail BEFORE INSERT ON enquiry BEGIN SELECT RAISE(ABORT, 'forced'); END",
    );
    try {
      const r = await send('/request', fields());
      const html = await r.text();
      expect(r.status).toBe(500);
      expect(r.headers.get('location')).toBeNull();
      expect(html).toContain('was not saved');
      expect(html).not.toContain('AT-');
    } finally {
      await db.exec('DROP TRIGGER rq_fail');
    }
  });
});

describe('acknowledgement page (FR-ENQ-03/04)', () => {
  it('shows the reference code, the not-a-booking statement and nothing the customer typed', async () => {
    const r = await send(
      '/request',
      fields({ name: 'Zed Unique Fake', notes: 'unique-fake-note' }),
    );
    const ref = refOf(r);
    const page = await get(`/request/thanks?ref=${ref}`);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain(ref);
    expect(html).toContain('not a confirmed appointment');
    expect(html).not.toMatch(/Zed Unique|unique-fake-note|7712|\+670/);
    expect(html).toContain('name="robots" content="noindex,follow"');
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.get('set-cookie')).toBeNull();
  });

  it('sends a missing or malformed reference back to the form, and does not echo it', async () => {
    for (const q of ['', '?ref=', '?ref=nope', '?ref=<script>']) {
      const r = await get(`/request/thanks${q}`);
      expect(r.status, q).toBe(303);
      expect(r.headers.get('location')).toBe('/request');
    }
    const tet = await get('/tet/request/thanks');
    expect(tet.headers.get('location')).toBe('/tet/request');
  });
});

// Phase 7c T6: the same single form, laid out as two steps with tappable choices. Server rules are covered above and unchanged.
describe('two-step layout', () => {
  const steps = (html: string) =>
    [
      ...html.matchAll(
        /<fieldset class="step"[\s\S]*?<\/fieldset>\s*(?=<fieldset class="step"|<p class="notice"|<p>\s*<button)/g,
      ),
    ].map((m) => m[0]);
  const seed = async () => {
    await db
      .prepare(
        "INSERT OR IGNORE INTO garment_category (slug, name) VALUES ('steps-cat-fake', 'Steps Cat Fake')",
      )
      .run();
    await db
      .prepare(
        "INSERT OR IGNORE INTO service_area (slug, name) VALUES ('steps-area-fake', 'Steps Area Fake')",
      )
      .run();
    const c = (await db
      .prepare("SELECT id FROM garment_category WHERE slug = 'steps-cat-fake'")
      .first<{ id: number }>())!.id;
    const a = (await db
      .prepare("SELECT id FROM service_area WHERE slug = 'steps-area-fake'")
      .first<{ id: number }>())!.id;
    return { c, a };
  };
  it('has two short sections in one form, with no step counter: what and where first, then who and consent', async () => {
    const html = await (await get('/request')).text();
    expect(/<main[\s\S]*<\/main>/.exec(html)![0].match(/<form /g)).toHaveLength(
      1,
    );
    const [one, two] = steps(html);
    expect(one, 'step 1').toContain('What do you need?');
    expect(two, 'step 2').toContain('How can we reach you?');
    expect(html).not.toMatch(/Step \d of \d/);
    // why and what next are stated before the form, and only name and number are asked for
    expect(html).toContain('What happens next');
    expect(html).toContain('Only your name and number are needed');
    for (const name of ['category', 'service', 'area', 'when', 'notes'])
      expect(one, name).toContain(`name="${name}"`);
    for (const name of ['name', 'phone', 'channel', 'consent'])
      expect(two, name).toContain(`name="${name}"`);
    expect(
      html.indexOf('type="submit"', html.indexOf('<main')),
    ).toBeGreaterThan(html.indexOf('How can we reach you?'));
  });
  it('offers categories as radio choices and areas as one drop-down list, both with "not sure yet"', async () => {
    const { c, a } = await seed();
    const html = await (await get('/request')).text();
    expect(html).not.toMatch(/<select[^>]*name="category"/);
    expect(html).not.toMatch(/<input[^>]*name="area"/);
    expect(html).toMatch(
      new RegExp(
        `<input[^>]*type="radio"[^>]*name="category"[^>]*value="${c}"`,
      ),
    );
    expect(html).toMatch(
      /<input[^>]*type="radio"[^>]*name="category"[^>]*value=""/,
    );
    const select =
      /<select[^>]*name="area"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
    expect(select).toMatch(/<option value(?:="")?[^>]*>Not sure yet<\/option>/);
    expect(select).toContain(`<option value="${a}"`);
    expect(select).toContain('<option value="other"');
    expect(html).toContain('<label for="area-select">');
    // Least-typing helpers: a landmark box that is always shown, tap choices for the time, ideas for the notes (script optional).
    expect(html).toContain('<label for="area_text">Street, landmark');
    expect(html).toMatch(/name="when_pick"[^>]*value="asap"/);
    expect(html).toMatch(
      /<div class="request__ideas"[^>]*data-suggest="notes"[^>]*hidden/,
    );
    expect(html).toContain('Steps Cat Fake');
  });
  it('keeps the chosen category and area when the form comes back with a mistake', async () => {
    const { c, a } = await seed();
    const html = await (
      await send(
        '/request',
        fields({ name: '', category: String(c), area: String(a) }),
      )
    ).text();
    expect(html).toMatch(
      new RegExp(
        `<input[^>]*name="category"[^>]*value="${c}"[^>]*checked|<input[^>]*checked[^>]*name="category"[^>]*value="${c}"`,
      ),
    );
    expect(html).toMatch(new RegExp(`<option value="${a}"[^>]*selected`));
  });
  it('stores a request made with the radio choices exactly as before', async () => {
    const { c, a } = await seed();
    const r = await send(
      '/request',
      fields({ category: String(c), area: String(a) }),
    );
    expect(r.status).toBe(303);
    const e = await enquiry(refOf(r));
    expect(e!.garment_category_id).toBe(c);
    expect(e!.area_id).toBe(a);
  });
});
