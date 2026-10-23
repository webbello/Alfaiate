import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  getPublishedBySlug,
  listPublished,
} from '../../src/modules/directory/queries';

const db = env.DB;
const SECRETS = [
  'SECRET-PRIVATE-NAME',
  '+67099999999',
  'SECRET-PERMISSION-NOTE',
  'SECRET-FEE-WORDING',
  'SECRET-INTERNAL-NOTE',
  'secret-admin@example.test',
  'SECRET-DRAFT-ONLY',
];

// Every key a public view model may contain. A new key must be added here on purpose, after asking whether it is public.
const ALLOWED = new Set([
  'slug',
  'name',
  'photo',
  'specialties',
  'areas',
  'homeVisits',
  'priceHint',
  'priceCategory', // the public name of one work type, for the price line on a card
  'from',
  'to',
  'base',
  'alt',
  'caption',
  'description',
  'address',
  'languages',
  'priceNote',
  'contacts',
  'whatsapp',
  'phone',
  'value',
  'verified',
  'categories',
  'priceFrom',
  'priceTo',
  'unit',
  'confirmedOn',
  'kind',
  'photos',
  'profilePhoto',
  // wrappers used by this test and by listPublished
  'profile',
  'list',
  'tailors',
  'truncated',
]);
const keysOf = (value: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, found));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      found.add(k);
      keysOf(v, found);
    }
  return found;
};

async function seed() {
  const admin = (
    await db
      .prepare(
        "INSERT INTO admin_user (email, password_hash, role) VALUES ('secret-admin@example.test', 'h', 'owner')",
      )
      .run()
  ).meta.last_row_id;
  const t = (
    await db
      .prepare(
        `INSERT INTO tailor (slug, display_name, description, status, is_published, permission_recorded, permission_note, permission_date, contact_publish_consent,
                             whatsapp_e164, phone_e164, private_contact_name, private_phone, fee_terms_text, fee_terms_agreed_on, shop_address_text)
         VALUES ('privacy-fake', 'Privacy Fake', 'Public words', 'approved', 1, 1, 'SECRET-PERMISSION-NOTE', '2026-01-01', 1,
                 '+67077123456', '+67033123456', 'SECRET-PRIVATE-NAME', '+67099999999', 'SECRET-FEE-WORDING', '2026-02-02', 'Rua Fake 1')`,
      )
      .run()
  ).meta.last_row_id;
  await db
    .prepare(
      'INSERT INTO internal_note (body, author_id, tailor_id) VALUES (?, ?, ?)',
    )
    .bind('SECRET-INTERNAL-NOTE', admin, t)
    .run();
  await db
    .prepare(
      "INSERT INTO tailor (slug, display_name, description, status) VALUES ('draft-privacy-fake', 'SECRET-DRAFT-ONLY', 'SECRET-DRAFT-ONLY', 'draft')",
    )
    .run();
  const c = (
    await db
      .prepare(
        "INSERT INTO garment_category (slug, name) VALUES ('privacy-cat', 'Privacy cat')",
      )
      .run()
  ).meta.last_row_id;
  await db
    .prepare(
      'INSERT INTO tailor_category (tailor_id, category_id, price_from) VALUES (?, ?, 1000)',
    )
    .bind(t, c)
    .run();
  await db
    .prepare(
      "INSERT INTO portfolio_image (tailor_id, file_key, alt_text, permission_granted, permission_note) VALUES (?, ?, 'Alt', 1, NULL)",
    )
    .bind(t, 'a'.repeat(32))
    .run()
    .catch(() => undefined);
}

describe('public view models never carry private data (SEC-05, BR-07, BR-06, AC-15)', () => {
  it('contain none of the seeded private values, in the list or on the profile', async () => {
    await seed();
    const profile = await getPublishedBySlug(db, 'privacy-fake');
    const list = await listPublished(db, {
      category: undefined,
      area: undefined,
      homeVisit: false,
    });
    expect(profile).not.toBeNull();
    const text = JSON.stringify({ profile, list });
    for (const secret of SECRETS) expect(text, secret).not.toContain(secret);
    expect(text).toContain('Public words'); // sanity: the public data is there
  });

  it('use only whitelisted keys', async () => {
    const profile = await getPublishedBySlug(db, 'privacy-fake');
    const list = await listPublished(db, {
      category: undefined,
      area: undefined,
      homeVisit: false,
    });
    const keys = [...keysOf({ profile, list })];
    expect(keys.filter((k) => !ALLOWED.has(k))).toEqual([]);
  });

  it('expose no database ids', async () => {
    const profile = await getPublishedBySlug(db, 'privacy-fake');
    expect(Object.keys(profile!)).not.toContain('id');
    expect(JSON.stringify(profile)).not.toMatch(
      /"(id|tailor_id|admin_user_id)"/,
    );
  });
});
