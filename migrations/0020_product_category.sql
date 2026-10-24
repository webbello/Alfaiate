-- product_category: The shop's product types, seeded because the shop needs them to exist. Serves FR-SHP-*.

CREATE TABLE product_category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 60),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

-- The only rows a migration seeds: the shop needs its four types to exist.
INSERT INTO product_category (slug, name, sort_order) VALUES
  ('exclusive-collection', 'Exclusive collection', 1),
  ('ready-made', 'Ready-made clothing', 2),
  ('fabrics', 'Fabrics', 3),
  ('accessories', 'Accessories', 4);
