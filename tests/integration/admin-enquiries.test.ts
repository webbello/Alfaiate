import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';

const db = env.DB;
const add = async (
  name: string,
  over: { status?: string; spam?: boolean; phone?: string } = {},
) => {
  const ref = `AT-ADM${String(unique()).padStart(5, '0')}`;
  await db
    .prepare(
      `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status, is_spam)
       VALUES (?, ?, ?, 'whatsapp', 1, 'v', '2026-01-01T00:00:00Z', ?, ?)`,
    )
    .bind(
      ref,
      name,
      over.phone ?? '+67077123456',
      over.status ?? 'new',
      over.spam ? 1 : 0,
    )
    .run();
  return ref;
};

describe('GET /admin/enquiries (FR-ADM-06, SEC-09, BR-07)', () => {
  it('sends an anonymous visitor to sign in and shows nothing', async () => {
    const r = await get('/admin/enquiries');
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toContain('/admin/login');
  });

  it('refuses editors and viewers (BR-07: they never see customer data)', async () => {
    await add('Hidden From Editors');
    for (const role of ['editor', 'viewer']) {
      const r = await get('/admin/enquiries', await signIn(role));
      expect(r.status, role).toBe(403);
      expect(await r.text()).not.toContain('Hidden From Editors');
    }
  });

  it('shows the list to a manager and an owner, privately', async () => {
    const ref = await add('Visible Fake Customer');
    for (const role of ['manager', 'owner']) {
      const r = await get('/admin/enquiries', await signIn(role));
      const html = await r.text();
      expect(r.status, role).toBe(200);
      expect(html).toContain(ref);
      expect(html).toContain('Visible Fake Customer');
      expect(html).toContain('+67077123456');
      expect(html).toContain(`href="/admin/enquiries/`);
      expect(r.headers.get('cache-control')).toMatch(/no-store/);
      expect(html).toContain('noindex');
    }
  });

  it('filters by status and searches by reference, name and phone', async () => {
    const cookie = await signIn('manager');
    const contacted = await add('Filter Contacted', { status: 'contacted' });
    const fresh = await add('Filter Fresh Person', { phone: '+67073335555' });
    const byStatus = await (
      await get('/admin/enquiries?status=contacted', cookie)
    ).text();
    expect(byStatus).toContain(contacted);
    expect(byStatus).not.toContain(fresh);
    expect(
      await (
        await get(`/admin/enquiries?q=${fresh.toLowerCase()}`, cookie)
      ).text(),
    ).toContain(fresh);
    expect(
      await (await get('/admin/enquiries?q=Fresh+Person', cookie)).text(),
    ).not.toContain(contacted);
    const phone = await (
      await get(`/admin/enquiries?q=${encodeURIComponent('7333 5555')}`, cookie)
    ).text();
    expect(phone).toContain(fresh);
  });

  it('hides spam unless asked, and says when the list was cut', async () => {
    const cookie = await signIn('owner');
    const spam = await add('Spam Sender', { spam: true });
    expect(await (await get('/admin/enquiries', cookie)).text()).not.toContain(
      spam,
    );
    expect(
      await (await get('/admin/enquiries?spam=1', cookie)).text(),
    ).toContain(spam);
  });

  it('escapes a hostile search term and does not break on odd input', async () => {
    const cookie = await signIn('owner');
    for (const q of [
      '"><script>alert(1)</script>',
      "'; DROP TABLE enquiry; --",
      '%',
      '😀'.repeat(60),
    ]) {
      const r = await get(
        `/admin/enquiries?q=${encodeURIComponent(q)}`,
        cookie,
      );
      const html = await r.text();
      expect(r.status).toBe(200);
      expect(html).not.toContain('"><script>'); // the quote is escaped, so the text stays inside the attribute
    }
    expect(
      (await db
        .prepare('SELECT count(*) AS c FROM enquiry')
        .first<{ c: number }>())!.c,
    ).toBeGreaterThan(0);
  });

  it('is linked from the dashboard only for roles that may open it', async () => {
    for (const [role, shown] of [
      ['owner', true],
      ['manager', true],
      ['editor', false],
      ['viewer', false],
    ] as const) {
      const html = await (await get('/admin', await signIn(role))).text();
      expect(html.includes('href="/admin/enquiries"'), role).toBe(shown);
    }
  });
});
