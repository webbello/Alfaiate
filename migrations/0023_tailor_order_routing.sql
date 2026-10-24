-- tailor_order_routing: Where a tailor's shop orders are sent on WhatsApp; set by staff only. Serves FR-SHP-*.

-- Where a tailor's products are ordered: the admin's number (default, also when there is no row), the tailor's own, or a number staff enter.
-- Set by staff only; a tailor cannot change it. The platform's own products always go to the admin number.
CREATE TABLE tailor_order_routing (
  tailor_id INTEGER PRIMARY KEY REFERENCES tailor (id) ON DELETE CASCADE,
  route TEXT NOT NULL CHECK (route IN ('admin', 'tailor', 'number')),
  number_e164 TEXT CHECK (number_e164 IS NULL OR (number_e164 GLOB '+[1-9]*' AND number_e164 NOT GLOB '*[^0-9+]*' AND length(number_e164) BETWEEN 8 AND 16)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((route = 'number') = (number_e164 IS NOT NULL))
);
