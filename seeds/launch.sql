-- Starting lists for launch (OQ-10: the owner confirms or edits them in /admin/categories and /admin/areas).
-- Not a migration, so nothing reaches a database unless the owner runs it. Local: `npm run db:seed:launch`.
-- Production: `wrangler d1 execute DB --remote --file=seeds/launch.sql` once, after the owner has agreed the lists.
-- Category slugs match the eight service cards on the home page. Area names are Timor-Leste's Dili administrative posts and municipalities.
INSERT OR IGNORE INTO garment_category (slug, name, sort_order) VALUES
  ('custom-clothing', 'Custom clothing', 1),
  ('traditional-wear', 'Traditional wear', 2),
  ('alterations', 'Alterations and repairs', 3),
  ('shirts-and-trousers', 'Shirts and trousers', 4),
  ('dresses', 'Dresses', 5),
  ('suits', 'Suits', 6),
  ('uniforms', 'Uniforms', 7),
  ('wedding', 'Wedding clothes', 8);
INSERT OR IGNORE INTO service_area (slug, name, sort_order) VALUES
  ('dili', 'Dili', 1),
  ('cristo-rei', 'Cristo Rei (Dili)', 2),
  ('dom-aleixo', 'Dom Aleixo (Dili)', 3),
  ('nain-feto', 'Nain Feto (Dili)', 4),
  ('vera-cruz', 'Vera Cruz (Dili)', 5),
  ('metinaro', 'Metinaro (Dili)', 6),
  ('atauro', 'Atauro', 7),
  ('aileu', 'Aileu', 8),
  ('ainaro', 'Ainaro', 9),
  ('baucau', 'Baucau', 10),
  ('bobonaro', 'Bobonaro', 11),
  ('cova-lima', 'Cova Lima', 12),
  ('ermera', 'Ermera', 13),
  ('lautem', 'Lautém', 14),
  ('liquica', 'Liquiçá', 15),
  ('manatuto', 'Manatuto', 16),
  ('manufahi', 'Manufahi', 17),
  ('oecusse', 'Oecusse', 18),
  ('viqueque', 'Viqueque', 19);
