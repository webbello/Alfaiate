-- enquiry: A customer request for a tailor; private, admin-only; the start of the manual referral workflow. Serves FR-ENQ-*, BR-07, PRV-*.

CREATE TABLE enquiry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_code TEXT NOT NULL UNIQUE CHECK (length(reference_code) > 0),
  customer_name TEXT,
  contact_number_e164 TEXT CHECK (contact_number_e164 IS NULL OR (contact_number_e164 GLOB '+[1-9]*' AND contact_number_e164 NOT GLOB '*[^0-9+]*' AND length(contact_number_e164) BETWEEN 8 AND 16)),
  contact_channel TEXT CHECK (contact_channel IS NULL OR contact_channel IN ('whatsapp', 'phone', 'either')),
  garment_category_id INTEGER REFERENCES garment_category (id) ON DELETE RESTRICT,
  service_description TEXT,
  area_id INTEGER REFERENCES service_area (id) ON DELETE RESTRICT,
  area_text TEXT,
  preferred_datetime_text TEXT,
  notes TEXT,
  preferred_tailor_id INTEGER REFERENCES tailor (id) ON DELETE SET NULL,
  consent_shared_with_tailor INTEGER NOT NULL CHECK (consent_shared_with_tailor = 1),
  consent_text_version TEXT NOT NULL CHECK (length(consent_text_version) > 0),
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'referred', 'accepted_by_tailor', 'completed_reported', 'not_converted', 'cancelled')),
  status_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  is_spam INTEGER NOT NULL DEFAULT 0 CHECK (is_spam IN (0, 1)),
  -- Where it came from: the plain request form, the business form (see enquiry_business), a shop item, or a tailor's profile page ('profile:<slug>').
  source TEXT CHECK (source IS NULL OR source IN ('form', 'business', 'shop') OR source GLOB 'profile:?*'),
  anonymised_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Live enquiries need a name, number and channel (PRV-01).
  CHECK (anonymised_at IS NOT NULL OR (customer_name IS NOT NULL AND length(trim(customer_name)) > 0 AND contact_number_e164 IS NOT NULL AND contact_channel IS NOT NULL)),
  -- Anonymised enquiries keep reporting fields only (PRV-04).
  CHECK (anonymised_at IS NULL OR (customer_name IS NULL AND contact_number_e164 IS NULL AND notes IS NULL AND service_description IS NULL AND area_text IS NULL AND preferred_datetime_text IS NULL))
);

CREATE INDEX enquiry_status ON enquiry (status, created_at);

-- Foreign keys that RESTRICT or SET NULL on delete: without an index every delete of a category, area or tailor scans enquiry.
CREATE INDEX enquiry_category ON enquiry (garment_category_id);

CREATE INDEX enquiry_area ON enquiry (area_id);

CREATE INDEX enquiry_preferred_tailor ON enquiry (preferred_tailor_id);
