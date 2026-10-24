-- tailor: A tailor and their public profile, with the rule that nothing is public without approval and recorded permission. Serves FR-PRO-*, BR-05, BR-06.

CREATE TABLE tailor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- identity
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'suspended', 'archived')),

  -- public profile (shown only while published; the profile photo is portfolio_image.is_profile_photo)
  description TEXT,
  shop_address_text TEXT,
  home_visits TEXT NOT NULL DEFAULT 'unknown' CHECK (home_visits IN ('yes', 'no', 'unknown')),
  languages TEXT,
  price_note TEXT,
  price_confirmed_on TEXT,
  verified_fields TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(verified_fields)), -- list of profile fields staff checked; edited as a whole, never queried by field

  -- contact (shown only with contact_publish_consent)
  whatsapp_e164 TEXT CHECK (whatsapp_e164 IS NULL OR (whatsapp_e164 GLOB '+[1-9]*' AND whatsapp_e164 NOT GLOB '*[^0-9+]*' AND length(whatsapp_e164) BETWEEN 8 AND 16)),
  phone_e164 TEXT CHECK (phone_e164 IS NULL OR (phone_e164 GLOB '+[1-9]*' AND phone_e164 NOT GLOB '*[^0-9+]*' AND length(phone_e164) BETWEEN 8 AND 16)),
  contact_publish_consent INTEGER NOT NULL DEFAULT 0 CHECK (contact_publish_consent IN (0, 1)),

  -- publishing and permission (BR-05, BR-06, AC-10): a tailor is public only when approved and permission is on record
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  published_at TEXT,
  permission_recorded INTEGER NOT NULL DEFAULT 0 CHECK (permission_recorded IN (0, 1)),
  permission_note TEXT,
  permission_date TEXT,

  -- admin only
  private_contact_name TEXT,
  private_phone TEXT,
  fee_terms_text TEXT, -- owner only
  fee_terms_agreed_on TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (is_published = 0 OR (status = 'approved' AND permission_recorded = 1))
);

CREATE INDEX tailor_published ON tailor (is_published, status);
