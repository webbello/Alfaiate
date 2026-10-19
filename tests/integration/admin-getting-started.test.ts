import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn } from './helpers';

// Phase 7b T3: an empty system tells the owner what to do first. This file starts with an empty database.
describe('getting started card', () => {
  it('shows the four first steps, with links, to a role that can edit tailors, while nothing exists yet', async () => {
    for (const role of ['owner', 'manager', 'editor']) {
      const html = await (await get('/admin', await signIn(role))).text();
      expect(html, role).toContain('Getting started');
      for (const href of [
        '/admin/categories',
        '/admin/areas',
        '/admin/tailors/new',
      ])
        expect(html, `${role} ${href}`).toContain(`href="${href}"`);
    }
    const viewer = await (await get('/admin', await signIn('viewer'))).text();
    expect(viewer).not.toContain('Getting started');
  });

  it('goes away as soon as there is a tailor or an enquiry', async () => {
    await env.DB.prepare(
      "INSERT INTO tailor (slug, display_name) VALUES ('gs-tailor', 'Getting Started Fake')",
    ).run();
    const html = await (await get('/admin', await signIn('owner'))).text();
    expect(html).not.toContain('Getting started');
  });
});

describe('getting started card with only an enquiry', () => {
  it('is hidden when there is an enquiry but no tailor', async () => {
    await env.DB.prepare('DELETE FROM tailor').run();
    await env.DB.prepare(
      "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at) VALUES ('AT-GS000001', 'GS Fake', '+67077000333', 'phone', 1, 'v', '2026-01-01T00:00:00Z')",
    ).run();
    const html = await (await get('/admin', await signIn('owner'))).text();
    expect(html).not.toContain('Getting started');
  });
});
