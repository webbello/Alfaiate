-- Shop S1b: photos of a product. Bytes live in R2 under product/<product_id>/<file_key>/<variant>.jpg; this row is the metadata.
-- A platform product's photo is the platform's own, so there is no per-photo permission yet; tailors' products (S4) add one.
-- The photo is public only while its product is published (the public route asks D1 every time).
CREATE TABLE product_image (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES product (id) ON DELETE CASCADE,
  file_key TEXT NOT NULL UNIQUE CHECK (length(file_key) > 0),
  alt_text TEXT NOT NULL CHECK (length(trim(alt_text)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX product_image_product ON product_image (product_id, sort_order);
