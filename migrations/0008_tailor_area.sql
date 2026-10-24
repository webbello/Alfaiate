-- tailor_area: Where a tailor has a shop or goes to the customer. Serves FR-PRO-*.

-- Where a tailor has a shop ('shop_location') or goes to the customer ('serves').
CREATE TABLE tailor_area (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tailor_id INTEGER NOT NULL REFERENCES tailor (id) ON DELETE CASCADE,
  area_id INTEGER NOT NULL REFERENCES service_area (id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('shop_location', 'serves')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (tailor_id, area_id, kind)
);

CREATE INDEX tailor_area_area ON tailor_area (area_id);
