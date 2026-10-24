-- product_image: A product photo (metadata only; bytes are in R2). Serves FR-SHP-*.

-- Photo metadata; bytes live in R2 under product/<product_id>/<file_key>/<variant>.jpg. permission_granted defaults to 1 because the
-- platform's own photos are the platform's; a tailor's upload sets what the tailor confirmed.
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
