-- Alfaiate TL schema, part 1: admin and tailor-side tables (DATA_MODEL §3.1-3.6, 3.11).
-- Timestamps are UTC ISO-8601 text; booleans are 0/1; enums are CHECK-constrained text.

CREATE TABLE admin_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) > 3),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'editor', 'viewer')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  admin_user_id INTEGER NOT NULL REFERENCES admin_user (id) ON DELETE CASCADE,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX session_user ON session (admin_user_id);

-- Append-only by convention; never holds customer data.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER REFERENCES admin_user (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) > 0),
  entity_type TEXT,
  entity_id INTEGER,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE tailor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  description TEXT,
  profile_photo_id INTEGER REFERENCES portfolio_image (id) ON DELETE SET NULL,
  shop_address_text TEXT,
  home_visits TEXT NOT NULL DEFAULT 'unknown' CHECK (home_visits IN ('yes', 'no', 'unknown')),
  languages TEXT,
  price_note TEXT,
  price_confirmed_on TEXT,
  whatsapp_e164 TEXT CHECK (whatsapp_e164 IS NULL OR (whatsapp_e164 GLOB '+[1-9]*' AND whatsapp_e164 NOT GLOB '*[^0-9+]*' AND length(whatsapp_e164) BETWEEN 8 AND 16)),
  phone_e164 TEXT CHECK (phone_e164 IS NULL OR (phone_e164 GLOB '+[1-9]*' AND phone_e164 NOT GLOB '*[^0-9+]*' AND length(phone_e164) BETWEEN 8 AND 16)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'suspended', 'archived')),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  published_at TEXT,
  permission_recorded INTEGER NOT NULL DEFAULT 0 CHECK (permission_recorded IN (0, 1)),
  permission_note TEXT,
  permission_date TEXT,
  contact_publish_consent INTEGER NOT NULL DEFAULT 0 CHECK (contact_publish_consent IN (0, 1)),
  verified_fields TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(verified_fields)),
  fee_terms_text TEXT,
  fee_terms_agreed_on TEXT,
  private_contact_name TEXT,
  private_phone TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- BR-05, BR-06, AC-10: publishing needs approval and recorded permission.
  CHECK (is_published = 0 OR (status = 'approved' AND permission_recorded = 1))
);
CREATE INDEX tailor_published ON tailor (is_published, status);

CREATE TABLE garment_category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Prices are whole minor units of the single site-wide currency (OQ-14 pending).
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

CREATE TABLE service_area (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

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

-- Metadata only: image bytes live in R2 under file_key. Public only when permission_granted (BR-06).
CREATE TABLE portfolio_image (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tailor_id INTEGER NOT NULL REFERENCES tailor (id) ON DELETE CASCADE,
  file_key TEXT NOT NULL UNIQUE CHECK (length(file_key) > 0),
  alt_text TEXT NOT NULL CHECK (length(trim(alt_text)) > 0),
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  permission_granted INTEGER NOT NULL DEFAULT 0 CHECK (permission_granted IN (0, 1)),
  permission_date TEXT,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX portfolio_image_tailor ON portfolio_image (tailor_id, sort_order);
