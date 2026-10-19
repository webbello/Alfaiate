-- FAKE data for the browser tests only (never a migration, never production). Applied after seeds/placeholders.sql.
INSERT INTO tailor (slug, display_name, description, status, is_published, permission_recorded, permission_date, contact_publish_consent, whatsapp_e164, phone_e164, home_visits)
VALUES ('e2e-fake-tailor', 'E2E Fake Tailor', 'Made-up tailor for browser tests.', 'approved', 1, 1, '2026-01-01', 1, '+67077123456', '+67033123456', 'yes');
INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to) SELECT t.id, c.id, 2000, 5000 FROM tailor t, garment_category c WHERE t.slug = 'e2e-fake-tailor' AND c.slug = 'placeholder-category-1';
INSERT INTO tailor_area (tailor_id, area_id, kind) SELECT t.id, a.id, 'shop_location' FROM tailor t, service_area a WHERE t.slug = 'e2e-fake-tailor' AND a.slug = 'placeholder-area-1';
INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, notes, consent_shared_with_tailor, consent_text_version, consent_at)
VALUES ('AT-E2EFAKE2', 'E2E Fake Customer', '+67077654321', 'whatsapp', 'Made-up notes for browser tests.', 1, 'consent-2026-10-v1-en', '2026-01-01T00:00:00Z');
INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status) SELECT id, NULL, 'new' FROM enquiry WHERE reference_code = 'AT-E2EFAKE2';
-- Fee terms agreed for the seeded tailor (needed before a fee can be due), and a second enquiry for the referral journey.
UPDATE tailor SET fee_terms_agreed_on = '2026-01-01' WHERE slug = 'e2e-fake-tailor';
INSERT INTO enquiry (reference_code, customer_name, contact_number_e164, contact_channel, consent_shared_with_tailor, consent_text_version, consent_at)
VALUES ('AT-E2EFAKE3', 'E2E Fake Customer Three', '+67077654322', 'phone', 1, 'consent-2026-10-v1-en', '2026-01-01T00:00:00Z');
INSERT INTO enquiry_status_log (enquiry_id, from_status, to_status) SELECT id, NULL, 'new' FROM enquiry WHERE reference_code = 'AT-E2EFAKE3';
