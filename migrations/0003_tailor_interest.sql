-- Phase 7c T7: tailors who want to be listed can leave their details (FR-JOIN-01..03). This is NOT a registration: no account, no profile, nothing public.
-- The owner calls them and onboards offline (journey J4). Personal fields are removable like an enquiry's (PRV-04).
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (anonymised_at IS NOT NULL OR (contact_name IS NOT NULL AND length(trim(contact_name)) > 0 AND phone_e164 IS NOT NULL)),
  CHECK (anonymised_at IS NULL OR (contact_name IS NULL AND business_name IS NULL AND phone_e164 IS NULL AND area_text IS NULL AND craft_text IS NULL AND message IS NULL))
);
CREATE INDEX tailor_interest_created ON tailor_interest (created_at);
