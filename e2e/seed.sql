-- FAKE data for the browser tests only (never a migration, never production). Applied after seeds/placeholders.sql.
INSERT INTO tailor (slug, display_name, description, status, is_published, permission_recorded, permission_date, contact_publish_consent, whatsapp_e164, phone_e164, home_visits)
VALUES ('e2e-fake-tailor', 'E2E Fake Tailor', 'Made-up tailor for browser tests.', 'approved', 1, 1, '2026-01-01', 1, '+67077123456', '+67033123456', 'yes');
INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to) SELECT t.id, c.id, 2000, 5000 FROM tailor t, garment_category c WHERE t.slug = 'e2e-fake-tailor' AND c.slug = 'placeholder-category-1';
INSERT INTO tailor_area (tailor_id, area_id, kind) SELECT t.id, a.id, 'shop_location' FROM tailor t, service_area a WHERE t.slug = 'e2e-fake-tailor' AND a.slug = 'placeholder-area-1';
