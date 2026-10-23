import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, csrfOf, get, post, signIn, unique } from './helpers';
import { worker } from './worker';
import { issueToken } from '../../src/modules/enquiry/spam';

// Phase 7d (FR-PUB-08): the footer sign-up, switched on in this test project (NEWSLETTER_ENABLED=true).
const SECRET = 'integration-form-secret-0123456789';
const send = async (path: string, email: string) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        'cf-connecting-ip': `198.51.104.${unique() % 250}`,
      },
      body: new URLSearchParams({
        form_token: await issueToken(SECRET, new Date(Date.now() - 10_000)),
        email,
        consent: 'yes',
      }),
      redirect: 'manual',
    }),
  );

describe('footer newsletter', () => {
  it('appears in the footer of public pages with a labelled email box, consent and a token', async () => {
    const footer = /<footer[\s\S]*<\/footer>/.exec(
      await (await get('/about')).text(),
    )![0];
    expect(footer).toContain('Stay Updated');
    expect(footer).toContain('action="/newsletter"');
    expect(footer).toMatch(/<label for="footer-email"/);
    expect(footer).toMatch(/<input[^>]*name="consent"(?![^>]*checked)/);
    expect(footer).toContain('name="form_token"');
  });
  it('signs up and thanks without echoing the address, in both languages', async () => {
    const r = await send('/newsletter', `reader${unique()}@example.test`);
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/newsletter/thanks');
    const thanks = await (await get('/newsletter/thanks')).text();
    expect(thanks).toContain('you are signed up');
    expect(thanks).toContain('name="robots" content="noindex,follow"');
    expect(
      (
        await send('/tet/newsletter', `leitor${unique()}@example.test`)
      ).headers.get('location'),
    ).toBe('/tet/newsletter/thanks');
  });
  it('re-shows the form with a message for a bad address', async () => {
    const r = await send('/newsletter', 'not-an-email');
    expect(r.status).toBe(400);
    expect(await r.text()).toContain('Please enter an email address');
  });
  it('lists addresses for the owner only, who can remove one; never on a public page', async () => {
    const email = `listed${unique()}@example.test`;
    await send('/newsletter', email);
    expect(
      (await get('/admin/newsletter', await signIn('manager'))).status,
    ).toBe(403);
    const owner = await signIn('owner');
    const page = await (await get('/admin/newsletter', owner)).text();
    expect(page).toContain(email);
    const id = (await env.DB.prepare(
      'SELECT id FROM newsletter_signup WHERE email = ?',
    )
      .bind(email)
      .first<{ id: number }>())!.id;
    const r = await post(`/admin/newsletter/${id}/remove`, owner, {
      csrf: await csrfOf(owner),
    });
    expect(r.headers.get('location')).toBe(
      '/admin/newsletter?msg=newsletter_removed',
    );
    for (const path of ['/', '/tailors', '/newsletter/thanks', '/sitemap.xml'])
      expect(await (await get(path)).text()).not.toContain(email);
  });
});
