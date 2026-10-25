import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';

// FR-ADM-12: a New request waiting 24 hours or more says so in words, and the oldest New request comes first.
const add = (ref: string, createdAt: string, status = 'new') =>
  env.DB.prepare(
    `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status, created_at)
     VALUES (?, 'Waiting Fake Customer', '+67070003456', 'phone', 1, 'v1', '2026-01-01T00:00:00Z', ?, ?)`,
  )
    .bind(ref, status, createdAt)
    .run();
const rowOf = (html: string, ref: string) => {
  const start = html.indexOf(`>${ref}</a>`);
  expect(start, ref).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</tr>', start));
};

describe('requests waiting 24 hours or more', () => {
  it('flags an old New request, not a fresh one or an answered one, and lists the oldest New first', async () => {
    const n = String(unique()).padStart(6, '0');
    const old = `AT-WO${n}A`.slice(0, 11);
    const fresh = `AT-WF${n}A`.slice(0, 11);
    const answered = `AT-WA${n}A`.slice(0, 11);
    await add(old, '2020-01-01T00:00:00.000Z');
    await add(fresh, new Date().toISOString());
    await add(answered, '2020-01-02T00:00:00.000Z', 'contacted');
    const html = await (
      await get('/admin/enquiries', await signIn('manager'))
    ).text();
    expect(rowOf(html, old)).toContain('Waiting 24h+');
    expect(rowOf(html, fresh)).not.toContain('Waiting 24h+');
    expect(rowOf(html, answered)).not.toContain('Waiting 24h+');
    expect(html.indexOf(`>${old}</a>`)).toBeLessThan(
      html.indexOf(`>${fresh}</a>`),
    );
  });
});
