-- PLACEHOLDER DATA for local development only. The real lists come from the owner (OQ-10).
-- Applied by `npm run db:seed`; deliberately NOT a migration, so it never reaches production.
INSERT OR IGNORE INTO garment_category (slug, name, sort_order) VALUES ('placeholder-category-1', '[Placeholder] Suits', 1), ('placeholder-category-2', '[Placeholder] Dresses', 2), ('placeholder-category-3', '[Placeholder] Shirts and trousers', 3), ('placeholder-category-4', '[Placeholder] Alterations', 4);
INSERT OR IGNORE INTO service_area (slug, name, sort_order) VALUES ('placeholder-area-1', '[Placeholder] Area 1', 1), ('placeholder-area-2', '[Placeholder] Area 2', 2), ('placeholder-area-3', '[Placeholder] Area 3', 3);
