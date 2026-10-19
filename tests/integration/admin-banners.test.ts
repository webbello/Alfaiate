import { describe, expect, it } from 'vitest';
import { csrfOf, get, post, signIn, unique } from './helpers';
import { env } from 'cloudflare:workers';

// Phase 7b T2: a message after an action is a banner that says "Done." or "Problem." in words and uses the matching live-region role.
const banner = (html: string) =>
  html.match(
    /<div class="flash flash--(success|problem)" role="(status|alert)">([\s\S]*?)<\/div>/,
  );
const tailorId = async () =>
  (
    await env.DB.prepare(
      "INSERT INTO tailor (slug, display_name) VALUES (?, 'Banner Fake')",
    )
      .bind(`bn-${unique()}`)
      .run()
  ).meta.last_row_id as number;

describe('message banners', () => {
  it('a success says Done and is a polite status, a problem says Problem and is an alert, on every page that shows messages', async () => {
    const owner = await signIn('owner');
    const id = await tailorId();
    const pages = [
      '/admin/users',
      '/admin/categories',
      '/admin/areas',
      `/admin/tailors/${id}`,
      '/admin/tailors/new',
    ];
    for (const path of pages) {
      const ok = banner(await (await get(`${path}?msg=saved`, owner)).text());
      expect(ok?.[1], `${path} saved`).toBe('success');
      expect(ok?.[2], `${path} saved`).toBe('status');
      expect(ok?.[3], `${path} saved`).toContain('<strong>Done.</strong>');
      const bad = banner(
        await (await get(`${path}?msg=invalid`, owner)).text(),
      );
      expect(bad?.[1], `${path} invalid`).toBe('problem');
      expect(bad?.[2], `${path} invalid`).toBe('alert');
      expect(bad?.[3], `${path} invalid`).toContain(
        '<strong>Problem.</strong>',
      );
    }
    const enquiry = (
      await env.DB.prepare(
        "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at) VALUES (?, 'Banner Customer', '+67077000222', 'phone', 1, 'v', '2026-01-01T00:00:00Z')",
      )
        .bind(`AT-BN${String(unique()).padStart(6, '0')}`)
        .run()
    ).meta.last_row_id;
    expect(
      banner(
        await (
          await get(`/admin/enquiries/${enquiry}?msg=status_saved`, owner)
        ).text(),
      )?.[1],
    ).toBe('success');
    expect(
      banner(
        await (
          await get(`/admin/enquiries/${enquiry}?msg=no_agreed_terms`, owner)
        ).text(),
      )?.[1],
    ).toBe('problem');
  });

  it('shows the result of a password change on the account page (problem, then success)', async () => {
    const owner = await signIn('owner');
    const csrf = await csrfOf(owner);
    const wrong = await post('/admin/account', owner, {
      csrf,
      current_password: 'not-the-password',
      new_password: 'another-long-passphrase-123',
    });
    expect(banner(await wrong.text())?.[1]).toBe('problem');
  });

  it('shows no banner for an unknown or hostile code, and never echoes it', async () => {
    const owner = await signIn('owner');
    for (const code of [
      'nonsense',
      '<script>alert(1)</script>',
      '__proto__',
      'constructor',
      '',
    ]) {
      const html = await (
        await get(`/admin/users?msg=${encodeURIComponent(code)}`, owner)
      ).text();
      expect(banner(html), code).toBeNull();
      expect(html, code).not.toContain('alert(1)');
    }
  });

  it('shows the failed sign-in as a problem alert', async () => {
    const response = await (
      await import('./helpers')
    ).post('/admin/login', undefined, {
      email: 'nobody@example.test',
      password: 'wrong-wrong-wrong',
    });
    const html = await response.text();
    expect(banner(html)?.[1]).toBe('problem');
    expect(banner(html)?.[2]).toBe('alert');
  });
});
