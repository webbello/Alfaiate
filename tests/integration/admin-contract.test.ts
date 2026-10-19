import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';

// Phase 7b safety net: while the admin markup is rebuilt, every page must keep every form, control name and link it had before.
// (More may be added, for example in the new header bar; nothing may disappear.) The baseline was recorded from the pre-7b pages.
export const contractOf = (html: string) => {
  const norm = (text: string) => text.replace(/\d+/g, 'N');
  const forms = [...html.matchAll(/<form\b[^>]*>/g)].map((m) => {
    const tag = m[0];
    const method = (
      tag.match(/\bmethod="([^"]*)"/)?.[1] ?? 'get'
    ).toUpperCase();
    const action = tag.match(/\baction="([^"]*)"/)?.[1] ?? '';
    return norm(`${method} ${action}`);
  });
  const controls = [
    ...html.matchAll(
      /<(?:input|select|textarea|button)\b[^>]*\bname="([^"]*)"/g,
    ),
  ].map((m) => m[1]);
  const links = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)]
    .map((m) => norm(m[1]))
    .filter((href) => !href.startsWith('/_astro'));
  const unique = (items: string[]) => [...new Set(items)].sort();
  return {
    forms: unique(forms),
    controls: unique(controls),
    links: unique(links),
  };
};

const db = env.DB;
const q = async (sql: string, ...binds: unknown[]) =>
  (
    await db
      .prepare(sql)
      .bind(...binds)
      .run()
  ).meta.last_row_id as number;

export async function seedContractData() {
  const draft = await q(
    "INSERT INTO tailor (slug, display_name, description, status, whatsapp_e164, phone_e164, contact_publish_consent, permission_recorded, permission_date) VALUES (?, 'Contract Draft', 'Fake', 'approved', '+67077123456', '+67033123456', 1, 1, '2026-01-01')",
    `ct-draft-${unique()}`,
  );
  const published = await q(
    "INSERT INTO tailor (slug, display_name, description, status, is_published, whatsapp_e164, phone_e164, contact_publish_consent, permission_recorded, permission_date, fee_terms_agreed_on) VALUES (?, 'Contract Published', 'Fake', 'approved', 1, '+67077123457', '+67033123457', 1, 1, '2026-01-01', '2026-01-01')",
    `ct-pub-${unique()}`,
  );
  await q(
    "INSERT INTO garment_category (slug, name) VALUES (?, 'Contract Category')",
    `ct-cat-${unique()}`,
  );
  await q(
    "INSERT INTO service_area (slug, name) VALUES (?, 'Contract Area')",
    `ct-area-${unique()}`,
  );
  const enquiry = await q(
    "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, notes, consent_shared_with_tailor, consent_text_version, consent_at) VALUES (?, 'Contract Customer', '+67077000111', 'phone', 'Fake notes', 1, 'v', '2026-01-01T00:00:00Z')",
    `AT-CT${String(unique()).padStart(6, '0')}`,
  );
  await q(
    "INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status) VALUES (?, NULL, 'new')",
    enquiry,
  );
  await q(
    "INSERT INTO referral (enquiry_id, tailor_id, forwarded_at, tailor_response, completion_reported_at, completion_reported_by, fee_amount, fee_status) VALUES (?, ?, '2026-06-01', 'accepted', '2026-06-05', 'tailor', 5000, 'due')",
    enquiry,
    published,
  );
  return { draft, published, enquiry };
}

export const PAGES = (ids: {
  draft: number;
  published: number;
  enquiry: number;
}): [string, string][] => [
  ['dashboard', '/admin'],
  ['account', '/admin/account'],
  ['users', '/admin/users'],
  ['categories', '/admin/categories'],
  ['areas', '/admin/areas'],
  ['tailors', '/admin/tailors'],
  ['new tailor', '/admin/tailors/new'],
  ['draft tailor', `/admin/tailors/${ids.draft}`],
  ['published tailor', `/admin/tailors/${ids.published}`],
  ['inbox', '/admin/enquiries'],
  ['inbox with spam', '/admin/enquiries?spam=1'],
  ['enquiry', `/admin/enquiries/${ids.enquiry}`],
];

import baseline from './admin-contract.baseline.json';

describe('admin pages keep every form, control and link (contract)', () => {
  it('has lost nothing since the baseline', async () => {
    const ids = await seedContractData();
    const lost: string[] = [];
    let checked = 0;
    for (const role of ['owner', 'manager']) {
      const cookie = await signIn(role);
      for (const [label, path] of PAGES(ids)) {
        const expected = (
          baseline as Record<string, ReturnType<typeof contractOf>>
        )[`${role} ${label}`];
        const response = await get(path, cookie);
        if (!expected) {
          expect(
            response.status,
            `${role} ${label} was not allowed before`,
          ).not.toBe(200);
          continue;
        }
        expect(response.status, `${role} ${label}`).toBe(200);
        const now = contractOf(await response.text());
        checked++;
        for (const kind of ['forms', 'controls', 'links'] as const)
          for (const item of expected[kind])
            if (!now[kind].includes(item))
              lost.push(`${role} ${label}: ${kind} lost "${item}"`);
      }
    }
    expect(checked).toBe(Object.keys(baseline).length);
    expect(lost).toEqual([]);
  });
});
