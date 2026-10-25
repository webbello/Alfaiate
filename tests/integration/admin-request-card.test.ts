import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn, unique } from './helpers';

// FR-ADM-16: a request is a card on a phone (list), and its page opens with large actions: message the customer, one-tap status chips, add a note.
const run = (sql: string, ...args: (string | number | null)[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();
async function seed(channel = 'whatsapp') {
  const n = String(unique()).padStart(7, '0');
  const ref = `AT-K${n}`;
  await run(
    "INSERT OR IGNORE INTO garment_category (slug, name) VALUES ('card-cat-fake', 'Card Cat Fake')",
  );
  await run(
    "INSERT OR IGNORE INTO service_area (slug, name) VALUES ('card-area-fake', 'Card Area Fake')",
  );
  const id = (
    await run(
      "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status, garment_category_id, area_id) VALUES (?, 'Card Fake Customer', '+67070006543', ?, 1, 'v1', '2026-01-01T00:00:00Z', 'new', (SELECT id FROM garment_category WHERE slug = 'card-cat-fake'), (SELECT id FROM service_area WHERE slug = 'card-area-fake'))",
      ref,
      channel,
    )
  ).meta.last_row_id;
  return { ref, id };
}

describe('request cards and actions', () => {
  it('lists a request as a card with what was asked, how long it waited and a big message button', async () => {
    const { ref, id } = await seed();
    const html = await (
      await get(`/admin/enquiries?q=${ref}`, await signIn('manager'))
    ).text();
    const cards = /<ul class="req-cards"[\s\S]*?<\/ul>/.exec(html)?.[0] ?? '';
    expect(cards).toContain(`href="/admin/enquiries/${id}"`);
    expect(cards).toContain('Card Cat Fake · Card Area Fake');
    expect(cards).toMatch(/Received (just now|\d+ (min|h) ago)/);
    expect(cards).toMatch(
      /class="req-big" href="https:\/\/wa\.me\/67070006543\?text=/,
    );
    expect(cards).toContain('WhatsApp customer');
  });

  it('opens a request with the what, the wait, a message button, a note link and one status chip per status', async () => {
    const { id } = await seed();
    const html = await (
      await get(`/admin/enquiries/${id}`, await signIn('manager'))
    ).text();
    const card =
      /<section class="req-actions"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
    expect(card).toContain('Card Cat Fake · Card Area Fake');
    expect(card).toContain('WhatsApp customer');
    expect(card).toContain('href="#note"');
    const chips = [
      ...card.matchAll(
        /<button type="submit" name="status" value="([a-z_]+)"[^>]*aria-pressed="(true|false)"/g,
      ),
    ];
    expect(chips.map((c) => c[1])).toEqual([
      'new',
      'contacted',
      'referred',
      'accepted_by_tailor',
      'completed_reported',
      'not_converted',
      'cancelled',
    ]);
    expect(chips.filter((c) => c[2] === 'true').map((c) => c[1])).toEqual([
      'new',
    ]);
  });

  it('a status chip changes the status (the existing set_status form), and a phone-call customer gets Call instead of WhatsApp', async () => {
    const { id } = await seed('phone');
    const cookie = await signIn('manager');
    const html = await (await get(`/admin/enquiries/${id}`, cookie)).text();
    expect(
      /<section class="req-actions"[\s\S]*?<\/section>/.exec(html)![0],
    ).toContain('Call customer');
    const response = await post(`/admin/enquiries/${id}/actions`, cookie, {
      csrf: await csrfOf(cookie),
      action: 'set_status',
      status: 'contacted',
    });
    expect(response.status).toBe(303);
    const row = await env.DB.prepare('SELECT status FROM enquiry WHERE id = ?')
      .bind(id)
      .first<{ status: string }>();
    expect(row!.status).toBe('contacted');
    const after = await (await get(`/admin/enquiries/${id}`, cookie)).text();
    expect(/value="contacted"[^>]*aria-pressed="true"/.test(after)).toBe(true);
  });
});
