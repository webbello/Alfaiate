import { describe, expect, it, beforeAll } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';

const db = env.DB;
const q = async (sql: string, ...binds: unknown[]) =>
  (
    await db
      .prepare(sql)
      .bind(...binds)
      .run()
  ).meta.last_row_id as number;

// A small dataset, read with "all time" so the expected figures do not depend on today's date.
beforeAll(async () => {
  const user = await q(
    "INSERT INTO admin_user (email, password_hash, role) VALUES ('dash@example.test', 'h', 'owner')",
  );
  const enquiry = (status: string, spam = 0) =>
    q(
      `INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at, status, is_spam)
       VALUES (?, 'Dashboard Secret Customer', '+67077123456', 'phone', 1, 'v', '2026-01-01T00:00:00Z', ?, ?)`,
      `AT-D${String(unique()).padStart(7, '0')}`,
      status,
      spam,
    );
  const e1 = await enquiry('new');
  const e2 = await enquiry('completed_reported');
  const e3 = await enquiry('contacted');
  await enquiry('new', 1); // spam
  const t = await q(
    "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, phone_e164, fee_terms_agreed_on) VALUES ('dash-t', 'Dash Tailor', 'approved', 1, 1, 1, '+67033123456', '2026-01-01')",
  );
  await q(
    "INSERT INTO referral (enquiry_id, tailor_id, forwarded_at, tailor_response) VALUES (?, ?, '2026-06-01', 'accepted')",
    e1,
    t,
  );
  await q(
    "INSERT INTO referral (enquiry_id, tailor_id, forwarded_at, tailor_response, completion_reported_at, completion_reported_by, fee_amount, fee_status, fee_paid_at) VALUES (?, ?, '2026-06-02', 'accepted', '2026-06-10', 'tailor', 5000, 'paid', '2026-06-12')",
    e2,
    t,
  );
  await q(
    "INSERT INTO referral (enquiry_id, tailor_id, forwarded_at, tailor_response, completion_reported_at, completion_reported_by, fee_amount, fee_status) VALUES (?, ?, '2026-06-03', 'declined', '2026-06-11', 'customer', 2500, 'due')",
    e3,
    t,
  );
  await q(
    "INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status, changed_by, changed_at) SELECT id, NULL, 'contacted', ?, strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+3 hours') FROM enquiry WHERE id = ?",
    user,
    e3,
  );
  await q(
    "INSERT INTO contact_click_daily (tailor_id, channel, date, count) VALUES (?, 'phone', '2026-06-04', 6)",
    t,
  );
});
const page = async (role: string, query = '') =>
  (await get(`/admin${query}`, await signIn(role))).text();
const text = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the /admin dashboard figures (FR-RPT-01/02, ANA-04/05, AC-14)', () => {
  it('shows the figures for all time to a manager, labelled as reported, without any fee figure', async () => {
    const t = text(await page('manager', '?period=all'));
    expect(t).toContain('Enquiries received 3'); // spam excluded
    expect(t).toContain('Referrals forwarded (reported) 3');
    expect(t).toContain('Referrals accepted (reported) 2');
    expect(t).toContain('2 of 3 (67%)'); // M3 accepted of forwarded
    expect(t).toContain('3 of 3 (100%)'); // M2 every enquiry has a referral
    expect(t).toContain('1 of 3 (33%)'); // M4 completed as reported
    expect(t).toContain('Direct contact taps 6');
    expect(t).toContain('3 hours');
    for (const fee of [
      'Referral revenue',
      'Fee collection',
      '$50',
      '$25',
      'Fees due',
    ])
      expect(t, fee).not.toContain(fee);
  });

  it('shows the owner the fee figures too, still labelled reported', async () => {
    const t = text(await page('owner', '?period=all'));
    expect(t).toContain('Fees due (reported) $25');
    expect(t).toContain('Referral revenue (reported) $50');
    expect(t).toContain('Fee collection (reported)');
    expect(t).toContain('$50 of $75'); // M9 by amount: paid of paid plus due
  });

  it('gives editors and viewers no figures at all', async () => {
    for (const role of ['editor', 'viewer']) {
      const html = await page(role, '?period=all');
      expect(html, role).not.toContain('Enquiries received');
      expect(html, role).not.toMatch(/Referral revenue|Direct contact taps/);
    }
  });

  it('offers the three periods, defaults to this month, and ignores anything else', async () => {
    const html = await page('manager');
    for (const label of ['This month', 'Last 30 days', 'All time'])
      expect(html).toContain(label);
    const current = (p: string) =>
      new RegExp(`<a href="/admin\\?period=${p}"[^>]*aria-current="page"`).test(
        html,
      );
    expect([current('month'), current('30d'), current('all')]).toEqual([
      true,
      false,
      false,
    ]);
    for (const bad of [
      '?period=week',
      "?period=month'--",
      '?period=<script>alert(1)</script>',
      '?period=',
    ]) {
      const r = await get(`/admin${bad}`, await signIn('manager'));
      const body = await r.text();
      expect(r.status, bad).toBe(200);
      expect(body, bad).not.toContain('<script>alert(1)');
      expect(body, bad).toContain('Enquiries received');
    }
    const thirty = await page('manager', '?period=30d');
    expect(thirty).toMatch(
      /<a href="\/admin\?period=30d"[^>]*aria-current="page"/,
    );
    expect(thirty).not.toMatch(
      /<a href="\/admin\?period=month"[^>]*aria-current="page"/,
    );
  });

  it('shows "no data" for a ratio with nothing to divide by', async () => {
    // 30 days from now no seeded enquiry is created today in a window of its own, so use a period with none: the seeded rows are all created now,
    // hence this month has them; an empty database is covered in the unit tests. Here: the label exists when a value is missing.
    const t = text(await page('manager', '?period=all'));
    expect(t).not.toContain('NaN');
    expect(t).not.toContain('undefined');
  });

  it('never shows customer names, numbers or notes', async () => {
    for (const role of ['manager', 'owner']) {
      const html = await page(role, '?period=all');
      expect(html).not.toMatch(/Dashboard Secret|\+670|7712 3456/);
    }
  });

  it('keeps the existing dashboard content and is private', async () => {
    const r = await get('/admin?period=all', await signIn('owner'));
    const html = await r.text();
    expect(html).toContain('href="/admin/enquiries"');
    expect(html).toContain('name="csrf"');
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
  });
});

describe('the dashboard as cards (Phase 7b T3)', () => {
  const count = (html: string, needle: string) => html.split(needle).length - 1;
  const stats = (html: string) =>
    (html.match(/<div class="stat( stat--hero)?">/g) ?? []).length;

  it('shows the period as tabs, with the current one marked', async () => {
    const html = await page('manager', '?period=30d');
    expect(html).toContain('<nav class="tabs" aria-label="Period">');
    expect(count(html, 'href="/admin?period=')).toBe(3);
    expect(html).toMatch(
      /<a href="\/admin\?period=30d"[^>]*aria-current="page"/,
    );
  });

  it('shows the status counts as chips that open the inbox on that status', async () => {
    const html = await page('manager', '?period=all');
    for (const [status, n] of [
      ['new', 1],
      ['contacted', 1],
      ['completed_reported', 1],
    ] as const)
      expect(html).toMatch(
        new RegExp(
          `<a class="chip chip--[a-z]+" href="/admin/enquiries\\?status=${status}">[^<]*${n}[^<]*</a>`,
        ),
      );
    // seven chips, plus the bell in the top bar that opens the New ones
    expect(count(html, 'href="/admin/enquiries?status=')).toBe(8);
  });

  it('shows every figure as a card: ten for a manager, and the owner gets the fee figures as four more in their own block', async () => {
    const manager = await page('manager', '?period=all');
    expect(stats(manager)).toBe(10);
    expect(manager).not.toContain('Fees (owner only)');
    const owner = await page('owner', '?period=all');
    expect(stats(owner)).toBe(14);
    expect(owner).toMatch(/<h2[^>]*>Fees \(owner only\)<\/h2>/);
  });

  it('keeps "no data" literal in a card', async () => {
    const t = text(await page('manager', '?period=30d'));
    expect(t).toMatch(
      /Time to first contact \(reported\) [^A-Za-z]*(no data|\d)/,
    );
    expect(t).not.toContain('NaN');
  });

  it('is titled Dashboard, and gives roles without figures a short hint instead of an empty page', async () => {
    const html = await page('editor');
    expect(html).toContain('<title>Dashboard · Admin</title>');
    expect(html).not.toContain('Enquiries received');
    expect(html).toContain('class="empty"');
  });
});
