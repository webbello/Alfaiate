-- shop_order: A record of each prepared WhatsApp order message, with no customer data. Serves FR-SHP-*.

-- A record of each order message that was prepared, so staff can match a WhatsApp message to the site. No customer name, number or address
-- is ever stored. items_json and routes_json are frozen snapshots (items, prices at that moment, where each part was sent): written once, read whole,
-- never filtered by field, so they stay JSON instead of becoming line tables that later price changes could rewrite.
CREATE TABLE shop_order (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_code TEXT NOT NULL UNIQUE CHECK (reference_code GLOB 'OR-*' AND length(reference_code) = 11),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),
  routes_json TEXT NOT NULL CHECK (json_valid(routes_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX shop_order_created ON shop_order (created_at);
