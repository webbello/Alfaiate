-- Shop orders by WhatsApp (docs/SPEC-shop.md, S6). The cart is turned into an order message that opens WhatsApp; no payment is taken.
-- Who receives it is decided by staff only: each tailor has an order route (the admin's number, the tailor's own number, or a number staff enter),
-- and the platform's own products always go to the admin number. A tailor has no way to change it.
ALTER TABLE tailor ADD COLUMN order_route TEXT NOT NULL DEFAULT 'admin' CHECK (order_route IN ('admin', 'tailor', 'number'));
ALTER TABLE tailor ADD COLUMN order_number_e164 TEXT CHECK (order_number_e164 IS NULL OR (order_number_e164 GLOB '+[1-9]*' AND order_number_e164 NOT GLOB '*[^0-9+]*' AND length(order_number_e164) BETWEEN 8 AND 16));

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
