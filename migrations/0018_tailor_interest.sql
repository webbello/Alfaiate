-- tailor_interest: A tailor asking to join (the "Join us" form) and staff's decision; not a registration. Serves FR-JOIN-*, FR-TPO-01.

CREATE TABLE tailor_interest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_code TEXT NOT NULL UNIQUE CHECK (length(reference_code) > 0),
  contact_name TEXT,
  business_name TEXT,
  phone_e164 TEXT CHECK (phone_e164 IS NULL OR (phone_e164 GLOB '+[1-9]*' AND phone_e164 NOT GLOB '*[^0-9+]*' AND length(phone_e164) BETWEEN 8 AND 16)),
  area_text TEXT,
  craft_text TEXT,
  message TEXT,
  consent_contact INTEGER NOT NULL CHECK (consent_contact = 1),
  consent_text_version TEXT NOT NULL CHECK (length(consent_text_version) > 0),
  consent_at TEXT NOT NULL,
  anonymised_at TEXT,
  -- Staff decision (FR-TPO-01). Approving makes a draft tailor and an account; tailor_id points at that draft.
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'declined')),
  decided_at TEXT,
  tailor_id INTEGER REFERENCES tailor (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((decision = 'pending') = (decided_at IS NULL)),
  CHECK (anonymised_at IS NOT NULL OR (contact_name IS NOT NULL AND length(trim(contact_name)) > 0 AND phone_e164 IS NOT NULL)),
  CHECK (anonymised_at IS NULL OR (contact_name IS NULL AND business_name IS NULL AND phone_e164 IS NULL AND area_text IS NULL AND craft_text IS NULL AND message IS NULL))
);

CREATE INDEX tailor_interest_created ON tailor_interest (created_at);

CREATE INDEX tailor_interest_tailor ON tailor_interest (tailor_id);
