import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';

// FR-ADM-13: WhatsApp buttons on a request (customer) and a referral (tailor), the message holding the reference code only.
const run = (sql: string, ...args: (string | number | null)[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();
const tailor = async (n: string, whatsapp: string | null) =>
  (
    await run(
      "INSERT INTO tailor (slug, display_name, whatsapp_e164, status) VALUES (?, ?, ?, 'approved')",
      `reach-${n}`,
      `Reach Tailor ${n}`,
      whatsapp,
    )
  ).meta.last_row_id;
const enquiry = async (ref: string, channel: string) =>
  (
    await run(
      "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status) VALUES (?, 'Reach Fake Customer', '+67070004567', ?, 1, 'v1', '2026-01-01T00:00:00Z', 'new')",
      ref,
      channel,
    )
  ).meta.last_row_id;
const links = (html: string) =>
  [
    ...html.matchAll(
      /<a class="button-link" href="(https:\/\/wa\.me\/[^"]+|tel:[^"]+)"[^>]*>([^<]+)<\/a>/g,
    ),
  ].map((m) => ({ href: m[1]!.replaceAll('&#38;', '&'), label: m[2]! }));

describe('reach buttons on a request', () => {
  it('shows WhatsApp customer and WhatsApp tailor with the reference code only', async () => {
    const n = String(unique()).padStart(7, '0');
    const ref = `AT-R${n}`;
    const id = await enquiry(ref, 'whatsapp');
    const withNumber = await tailor(`${n}a`, '+67070009001');
    const noNumber = await tailor(`${n}b`, null);
    await run(
      'INSERT INTO referral (enquiry_id, tailor_id) VALUES (?, ?)',
      id,
      withNumber,
    );
    await run(
      'INSERT INTO referral (enquiry_id, tailor_id) VALUES (?, ?)',
      id,
      noNumber,
    );
    const html = await (
      await get(`/admin/enquiries/${id}`, await signIn('manager'))
    ).text();
    const found = links(html);
    expect(found.map((l) => l.label)).toEqual([
      'WhatsApp customer',
      'WhatsApp tailor',
    ]);
    expect(found[0]!.href).toMatch(/^https:\/\/wa\.me\/67070004567\?text=/);
    expect(found[1]!.href).toMatch(/^https:\/\/wa\.me\/67070009001\?text=/);
    for (const l of found) {
      const text = decodeURIComponent(l.href.split('text=')[1]!);
      expect(text).toContain(ref);
      expect(text).not.toContain('Reach Fake');
    }
    expect(html).toContain('No number is saved for this tailor.');
  });

  it('offers a call, not WhatsApp, to a customer who asked for phone calls', async () => {
    const n = String(unique()).padStart(7, '0');
    const id = await enquiry(`AT-P${n}`, 'phone');
    const html = await (
      await get(`/admin/enquiries/${id}`, await signIn('manager'))
    ).text();
    expect(links(html)).toEqual([
      { href: 'tel:+67070004567', label: 'Call customer' },
    ]);
  });
});
