import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// AC-15 (public part), SEC-05, BR-07, BR-06: values that must exist only on admin pages. Every public page, in both languages,
// is fetched and must contain none of them.
const SECRET = {
  privateName: 'SECRET-PRIVATE-CONTACT-NAME',
  privatePhone: '+67099988877',
  permissionNote: 'SECRET-PERMISSION-NOTE-TEXT',
  feeTerms: 'SECRET-FEE-TERMS-TEXT',
  internalNote: 'SECRET-INTERNAL-NOTE-TEXT',
  adminEmail: 'secret-admin-sweep@example.test',
  draftName: 'SECRET-DRAFT-TAILOR-NAME',
  unpermittedAlt: 'SECRET-UNPERMITTED-PHOTO-ALT',
  customerName: 'SECRET-CUSTOMER-NAME',
  customerPhone: '+67011122233',
  customerNote: 'SECRET-CUSTOMER-NOTES',
};

describe('public pages never contain private values (SEC-05, BR-07, AC-15)', () => {
  it('on any public page in either language', async () => {
    const db = env.DB;
    const admin = (
      await db
        .prepare(
          'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
        )
        .bind(SECRET.adminEmail, 'h', 'owner')
        .run()
    ).meta.last_row_id;
    const slug = `sweep-${unique()}`;
    const tailor = (
      await db
        .prepare(
          `INSERT INTO tailor (slug, display_name, description, status, is_published, permission_recorded, permission_note, permission_date, contact_publish_consent,
                               whatsapp_e164, phone_e164, private_contact_name, private_phone, fee_terms_text, fee_terms_agreed_on)
           VALUES (?, 'Sweep Public Fake', 'Public words', 'approved', 1, 1, ?, '2026-01-01', 1, '+67077123456', '+67033123456', ?, ?, ?, '2026-02-02')`,
        )
        .bind(
          slug,
          SECRET.permissionNote,
          SECRET.privateName,
          SECRET.privatePhone,
          SECRET.feeTerms,
        )
        .run()
    ).meta.last_row_id;
    await db
      .prepare(
        'INSERT INTO internal_note (body, author_id, tailor_id) VALUES (?, ?, ?)',
      )
      .bind(SECRET.internalNote, admin, tailor)
      .run();
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, description, status) VALUES (?, ?, ?, 'draft')",
      )
      .bind(`sweep-draft-${unique()}`, SECRET.draftName, SECRET.draftName)
      .run();
    await db
      .prepare(
        'INSERT INTO portfolio_image (tailor_id, file_key, alt_text, permission_granted) VALUES (?, ?, ?, 0)',
      )
      .bind(
        tailor,
        unique().toString(16).padStart(32, '0'),
        SECRET.unpermittedAlt,
      )
      .run();
    const cat = (
      await db
        .prepare(
          "INSERT INTO garment_category (slug, name) VALUES (?, 'Sweep Cat Fake')",
        )
        .bind(`sweep-cat-${unique()}`)
        .run()
    ).meta.last_row_id;
    await db
      .prepare(
        'INSERT INTO tailor_category (tailor_id, category_id, price_from) VALUES (?, ?, 1000)',
      )
      .bind(tailor, cat)
      .run();
    const catSlug = (await db
      .prepare('SELECT slug FROM garment_category WHERE id = ?')
      .bind(cat)
      .first<{ slug: string }>())!.slug;
    const enquiry = (
      await db
        .prepare(
          "INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, notes, consent_shared_with_tailor, consent_text_version, consent_at) VALUES (?, ?, ?, 'phone', ?, 1, 'v1', '2026-01-01T00:00:00Z')",
        )
        .bind(
          `REF-SWEEP-${unique()}`,
          SECRET.customerName,
          SECRET.customerPhone,
          SECRET.customerNote,
        )
        .run()
    ).meta.last_row_id;
    await db
      .prepare(
        "INSERT INTO referral (enquiry_id, tailor_id, fields_shared_note) VALUES (?, ?, 'SECRET-SHARED-FIELDS')",
      )
      .bind(enquiry, tailor)
      .run();

    const paths = [
      '/',
      '/tailors',
      `/tailors/${slug}`,
      `/categories/${catSlug}`,
      '/request',
      '/no-such-page',
      `/tailors?category=${catSlug}`,
    ];
    const secrets = [...Object.values(SECRET), 'SECRET-SHARED-FIELDS'];
    let sawPublicWords = false;
    for (const prefix of ['', '/tet']) {
      for (const path of paths) {
        const url = prefix ? (path === '/' ? '/tet/' : `/tet${path}`) : path;
        const html = await (await get(url)).text();
        for (const secret of secrets)
          expect(html, `${url} leaked ${secret}`).not.toContain(secret);
        if (html.includes('Public words')) sawPublicWords = true;
      }
    }
    expect(sawPublicWords).toBe(true); // sanity: the sweep did look at a page that shows the tailor
  });
});
