-- product: A shop product, the platform's own or a tailor's; enquiry only, no stock or payment. Serves FR-SHP-*, BR-14.

CREATE TABLE product (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 60),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  category_id INTEGER REFERENCES product_category (id) ON DELETE SET NULL,
  seller_tailor_id INTEGER REFERENCES tailor (id) ON DELETE CASCADE,

  -- page content; details, features and returns are one item a line
  description TEXT,
  details TEXT,
  features TEXT,
  returns TEXT,

  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents BETWEEN 0 AND 999999999),
  price_note TEXT,
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'unavailable')),

  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  published_at TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)), -- the "most loved" slider
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (is_published = 0 OR (description IS NOT NULL AND length(trim(description)) > 0))
);

CREATE INDEX product_public ON product (is_published, category_id);

CREATE INDEX product_seller ON product (seller_tailor_id);
