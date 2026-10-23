import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';

// Admin redesign: the dashboard says what needs the owner now, in counts only, and only for work the role may do.
const run = (sql: string, ...args: (string | number | null)[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();

describe('the dashboard worklist', () => {
  it('shows counts and links for new enquiries, join requests, referrals waiting, pages to review and fees, and never a name or number', async () => {
    const n = unique();
    await run(
      "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status) VALUES (?, 'Todo Fake Customer', '+67070001234', 'phone', 1, 'v1', '2026-01-01T00:00:00Z', 'new')",
      `AT-TODO${n}`,
    );
    await run(
      "INSERT INTO tailor_interest (reference_code, contact_name, phone_e164, consent_contact, consent_text_version, consent_at, decision) VALUES (?, 'Todo Fake Tailor', '+67070004321', 1, 'v1', '2026-01-01T00:00:00Z', 'pending')",
      `JN-TODO${n}`,
    );
    const tailorId = (
      await run(
        "INSERT INTO tailor (slug, display_name) VALUES (?, 'Todo Review Tailor')",
        `todo-${n}`,
      )
    ).meta.last_row_id;
    await run(
      "INSERT INTO tailor_account (tailor_id, review_requested_at) VALUES (?, '2026-01-02T00:00:00Z')",
      tailorId,
    );
    const html = await (await get('/admin', await signIn('owner'))).text();
    expect(html).toContain('What needs you now');
    expect(html).toMatch(/\d+ new (enquiry|enquiries) to answer/);
    expect(html).toMatch(/\d+ tailor (request|requests) to join/);
    expect(html).toMatch(/\d+ tailor (page|pages) ready for your review/);
    expect(html).toContain('href="/admin/enquiries?status=new"');
    expect(html).toContain('href="/admin/interest"');
    expect(html).toContain('href="/admin/tailors?published=0"');
    expect(html).not.toContain('Todo Fake');
    expect(html).not.toContain('+67070001234');
  });

  it('shows each role only the work it can do', async () => {
    const editor = await (await get('/admin', await signIn('editor'))).text();
    expect(editor).toContain('What needs you now');
    expect(editor).not.toMatch(/new (enquiry|enquiries) to answer/);
    expect(editor).not.toMatch(/tailor (request|requests) to join/);
    expect(editor).not.toContain('How this works');
    const manager = await (await get('/admin', await signIn('manager'))).text();
    expect(manager).toContain('How this works, step by step');
    expect(manager).not.toMatch(/fees? due or disputed/);
  });
});
