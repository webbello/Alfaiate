import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';

// FR-ADM-17: only publish or unpublish, switching a tailor sign-in off and removing customer details ask first; ordinary changes do not.
const run = (sql: string, ...args: (string | number | null)[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();
const confirms = (html: string) =>
  [...html.matchAll(/<details class="confirm">[\s\S]*?<\/details>/g)].map(
    (m) => m[0],
  );

describe('confirmations before hard-to-undo actions', () => {
  it('asks before unpublishing a tailor and before switching their sign-in off, in a form, with a Yes button', async () => {
    const n = unique();
    const tailor = (
      await run(
        "INSERT INTO tailor (slug, display_name, status, is_published, published_at, permission_recorded, permission_date, contact_publish_consent, whatsapp_e164) VALUES (?, ?, 'approved', 1, '2026-01-01T00:00:00Z', 1, '2026-01-01', 1, '+67070008001')",
        `confirm-${n}`,
        `Confirm Fake ${n}`,
      )
    ).meta.last_row_id;
    await run('INSERT INTO tailor_account (tailor_id) VALUES (?)', tailor);
    const html = await (
      await get(`/admin/tailors/${tailor}`, await signIn('owner'))
    ).text();
    const boxes = confirms(html);
    const unpublish = boxes.find((b) => b.includes('Yes, unpublish'));
    expect(unpublish, 'unpublish confirm').toBeDefined();
    expect(unpublish).toContain(
      'Take this tailor’s page off the public site now?',
    );
    expect(unpublish).toContain('class="danger"');
    expect(boxes.find((b) => b.includes('Yes, switch it off'))).toContain(
      'signs the tailor out',
    );
    // each confirm sits inside the form that carries the action, so pressing Yes sends it
    expect(html).toMatch(
      /<form[^>]*>(?:(?!<\/form>)[\s\S])*value="unpublish"(?:(?!<\/form>)[\s\S])*<details class="confirm">/,
    );
    expect(html).toMatch(
      /<form[^>]*>(?:(?!<\/form>)[\s\S])*value="deactivate"(?:(?!<\/form>)[\s\S])*<details class="confirm">/,
    );
  });

  it('keeps publishing disabled while something is missing, and ordinary actions without a question', async () => {
    const n = unique();
    const draft = (
      await run(
        'INSERT INTO tailor (slug, display_name) VALUES (?, ?)',
        `confirm-draft-${n}`,
        `Confirm Draft ${n}`,
      )
    ).meta.last_row_id;
    const owner = await signIn('owner');
    const draftHtml = await (
      await get(`/admin/tailors/${draft}`, owner)
    ).text();
    expect(draftHtml).toMatch(
      /<button type="submit" disabled[^>]*>\s*Publish\s*<\/button>/,
    );
    expect(confirms(draftHtml).some((b) => b.includes('Yes, publish'))).toBe(
      false,
    );
    // changing a request's status is one tap, with no question
    const enquiry = (
      await run(
        "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status) VALUES (?, 'Confirm Fake Customer', '+67070008002', 'phone', 1, 'v1', '2026-01-01T00:00:00Z', 'new')",
        `AT-C${String(n).padStart(7, '0')}`,
      )
    ).meta.last_row_id;
    const requestHtml = await (
      await get(`/admin/enquiries/${enquiry}`, owner)
    ).text();
    expect(
      /<section class="req-actions"[\s\S]*?<\/section>/.exec(requestHtml)![0],
    ).not.toContain('class="confirm"');
    expect(confirms(requestHtml)).toHaveLength(0);
  });
});
