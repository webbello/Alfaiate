-- Shop (docs/SPEC-shop.md, S1): products listed by the platform, later by approved tailors. Enquiry only: no stock, no payment, no orders.
-- seller_tailor_id is NULL for the platform's own products. A product is public only while is_published = 1.
CREATE TABLE product_category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 60),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE product (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 60),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents BETWEEN 0 AND 999999999),
  price_note TEXT,
  category_id INTEGER REFERENCES product_category (id) ON DELETE SET NULL,
  seller_tailor_id INTEGER REFERENCES tailor (id) ON DELETE CASCADE,
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'unavailable')),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- a published product always has a description and a name (the admin form shows why it cannot be published otherwise)
  CHECK (is_published = 0 OR (description IS NOT NULL AND length(trim(description)) > 0))
);
CREATE INDEX product_public ON product (is_published, category_id);

INSERT INTO product_category (slug, name, sort_order) VALUES
  ('exclusive-collection', 'Exclusive collection', 1),
  ('ready-made', 'Ready-made clothing', 2),
  ('fabrics', 'Fabrics', 3),
  ('accessories', 'Accessories', 4);
