-- tailor_category: Which garment categories a tailor makes, with an optional price range and where the price came from. Serves FR-PRO-*, BR-11.

-- What a tailor makes. Prices are whole minor units of the single site-wide currency (US cents).
CREATE TABLE tailor_category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tailor_id INTEGER NOT NULL REFERENCES tailor (id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES garment_category (id) ON DELETE RESTRICT,
  price_from INTEGER CHECK (price_from IS NULL OR price_from >= 0),
  price_to INTEGER CHECK (price_to IS NULL OR price_to >= 0),
  price_unit_note TEXT,
  price_source TEXT NOT NULL DEFAULT 'tailor_supplied' CHECK (price_source IN ('tailor_supplied', 'verified')),
  price_confirmed_on TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (tailor_id, category_id),
  CHECK (price_from IS NULL OR price_to IS NULL OR price_to >= price_from)
);

CREATE INDEX tailor_category_category ON tailor_category (category_id);
