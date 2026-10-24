-- Alfaiate TL baseline 5 of 6: the shop (docs/SPEC-shop.md, FR-SHP-*). Enquiry only: no stock, no payment, no customer accounts.
-- seller_tailor_id is NULL for the platform's own products. A product is public only while is_published = 1; a tailor's product also
-- needs that tailor published with recorded permission, and each of its photos needs the permission the tailor confirmed at upload
-- (default 1 for the platform's own photos). Photo bytes live in R2 under product/<product_id>/<file_key>/<variant>.jpg.
-- Where an order goes is tailor.order_route / order_number_e164 (0002).

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
  details TEXT,
  features TEXT,
  returns TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'unavailable')),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- a published product always has a description and a name (the admin form shows why it cannot be published otherwise)
  CHECK (is_published = 0 OR (description IS NOT NULL AND length(trim(description)) > 0))
);
CREATE INDEX product_public ON product (is_published, category_id);
CREATE INDEX product_seller ON product (seller_tailor_id);

INSERT INTO product_category (slug, name, sort_order) VALUES
  ('exclusive-collection', 'Exclusive collection', 1),
  ('ready-made', 'Ready-made clothing', 2),
  ('fabrics', 'Fabrics', 3),
  ('accessories', 'Accessories', 4);

CREATE TABLE product_image (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES product (id) ON DELETE CASCADE,
  file_key TEXT NOT NULL UNIQUE CHECK (length(file_key) > 0),
  alt_text TEXT NOT NULL CHECK (length(trim(alt_text)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  permission_granted INTEGER NOT NULL DEFAULT 1 CHECK (permission_granted IN (0, 1)),
  permission_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX product_image_product ON product_image (product_id, sort_order);

-- A record of each order message that was prepared, so staff can match a WhatsApp message to the site. No customer name, number or address is ever stored
-- (the customer sends the message from their own WhatsApp); only the items, prices at that moment and where each part was sent.
CREATE TABLE shop_order (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_code TEXT NOT NULL UNIQUE CHECK (reference_code GLOB 'OR-*' AND length(reference_code) = 11),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),
  routes_json TEXT NOT NULL CHECK (json_valid(routes_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX shop_order_created ON shop_order (created_at);
