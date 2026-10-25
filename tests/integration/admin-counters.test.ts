import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';

// FR-ADM-10: four counters at the top of the dashboard, each a link, counts only, and only for lists the role may open.
const run = (sql: string, ...args: (string | number | null)[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();
const counter = (html: string, key: string) => {
  const m = new RegExp(
    `<a class="counter" href="([^"]+)" data-counter="${key}"[^>]*>\\s*<span class="counter__value">(\\d+)</span>\\s*<span class="counter__label">([^<]+)</span>`,
  ).exec(html);
  return m ? { href: m[1], count: Number(m[2]), label: m[3] } : null;
};

describe('dashboard counters', () => {
  it('shows the four counters with links and the right counts, above the worklist', async () => {
    const owner = await signIn('owner');
    const before = await (await get('/admin', owner)).text();
    const base = (k: string) => counter(before, k)!.count;
    const n = unique();
    await run(
      "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status) VALUES (?, 'Counter Fake Customer', '+67070002345', 'phone', 1, 'v1', '2026-01-01T00:00:00Z', 'new')",
      `AT-CNT${n}`,
    );
    await run(
      "INSERT INTO tailor_interest (reference_code, contact_name, phone_e164, consent_contact, consent_text_version, consent_at, decision) VALUES (?, 'Counter Fake Tailor', '+67070005432', 1, 'v1', '2026-01-01T00:00:00Z', 'pending')",
      `JN-CNT${n}`,
    );
    const tailorId = (
      await run(
        "INSERT INTO tailor (slug, display_name) VALUES (?, 'Counter Review Tailor')",
        `cnt-${n}`,
      )
    ).meta.last_row_id;
    await run(
      "INSERT INTO tailor_account (tailor_id, review_requested_at) VALUES (?, '2026-01-02T00:00:00Z')",
      tailorId,
    );
    await run(
      'INSERT INTO shop_order (reference_code, total_cents, items_json, routes_json) VALUES (?, 100, ?, ?)',
      `OR-C${String(n).padStart(7, '0')}`,
      '[]',
      '[]',
    );
    // an order from long ago must not count as "today"
    await run(
      "INSERT INTO shop_order (reference_code, total_cents, items_json, routes_json, created_at) VALUES (?, 100, '[]', '[]', '2020-01-01T00:00:00.000Z')",
      `OR-O${String(n).padStart(7, '0')}`,
    );
    const html = await (await get('/admin', owner)).text();
    expect(counter(html, 'new')).toMatchObject({
      count: base('new') + 1,
      href: '/admin/enquiries?status=new',
      label: 'New requests',
    });
    expect(counter(html, 'join')).toMatchObject({
      count: base('join') + 1,
      href: '/admin/interest',
    });
    expect(counter(html, 'review')).toMatchObject({
      count: base('review') + 1,
      href: '/admin/tailors?published=0',
    });
    expect(counter(html, 'orders')).toMatchObject({
      count: base('orders') + 1,
      href: '/admin/orders',
      label: 'Orders today',
    });
    expect(html.indexOf('class="counters"')).toBeLessThan(
      html.indexOf('What needs you now'),
    );
    expect(html).not.toContain('Counter Fake');
    expect(html).not.toContain('+67070002345');
  });

  it('shows each role only the counters whose lists it may open', async () => {
    const editor = await (await get('/admin', await signIn('editor'))).text();
    expect(counter(editor, 'review')).not.toBeNull();
    for (const k of ['new', 'join', 'orders'])
      expect(counter(editor, k), k).toBeNull();
    const viewer = await (await get('/admin', await signIn('viewer'))).text();
    expect(viewer).not.toContain('class="counters"');
    const manager = await (await get('/admin', await signIn('manager'))).text();
    for (const k of ['new', 'join', 'review', 'orders'])
      expect(counter(manager, k), k).not.toBeNull();
  });
});
