-- Alfaiate TL baseline 3 of 6: private customer data and the manual referral workflow (DATA_MODEL §3.7-3.10).
-- Everything here is admin-only data (BR-07). The customer reference-image table (FR-ENQ-07) is not built and is not created.

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
  source TEXT,
  -- Business, school and organisation enquiries (FR-ENQ-09, source = 'business'); cleared by the anonymise routine like other free text.
  organisation_name TEXT CHECK (organisation_name IS NULL OR length(organisation_name) <= 100),
  group_size_text TEXT CHECK (group_size_text IS NULL OR length(group_size_text) <= 40),
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

CREATE TABLE enquiry_status_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL REFERENCES enquiry (id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('new', 'contacted', 'referred', 'accepted_by_tailor', 'completed_reported', 'not_converted', 'cancelled')),
  changed_by INTEGER REFERENCES admin_user (id) ON DELETE SET NULL,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX enquiry_status_log_enquiry ON enquiry_status_log (enquiry_id, changed_at);

CREATE TABLE referral (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL REFERENCES enquiry (id) ON DELETE CASCADE,
  tailor_id INTEGER NOT NULL REFERENCES tailor (id) ON DELETE RESTRICT,
  forwarded_at TEXT,
  forwarded_via TEXT CHECK (forwarded_via IS NULL OR forwarded_via IN ('whatsapp', 'phone', 'sms', 'in_person', 'other')),
  fields_shared_note TEXT,
  tailor_response TEXT NOT NULL DEFAULT 'pending' CHECK (tailor_response IN ('pending', 'accepted', 'declined', 'no_response')),
  responded_at TEXT,
  -- A report, not a verified fact (BR-10).
  completion_reported_at TEXT,
  completion_reported_by TEXT CHECK (completion_reported_by IS NULL OR completion_reported_by IN ('tailor', 'customer', 'owner_confirmed')),
  order_value_note TEXT,
  fee_basis_note TEXT,
  fee_amount INTEGER CHECK (fee_amount IS NULL OR fee_amount >= 0),
  fee_status TEXT NOT NULL DEFAULT 'not_due' CHECK (fee_status IN ('not_due', 'due', 'paid', 'waived', 'disputed')),
  fee_paid_at TEXT,
  closed_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (completion_reported_at IS NULL OR completion_reported_by IS NOT NULL),
  CHECK (fee_amount IS NULL OR completion_reported_at IS NOT NULL),
  CHECK (fee_status <> 'paid' OR fee_paid_at IS NOT NULL)
);
CREATE INDEX referral_enquiry ON referral (enquiry_id);
CREATE INDEX referral_tailor_fee ON referral (tailor_id, fee_status);

-- FR-REF-02, BR-08, AC-12: only approved tailors, only enquiries that still hold shareable data.
CREATE TRIGGER referral_requires_approved_tailor
BEFORE INSERT ON referral
WHEN (SELECT status FROM tailor WHERE id = NEW.tailor_id) <> 'approved'
BEGIN
  SELECT RAISE(ABORT, 'referral requires an approved tailor');
END;

CREATE TRIGGER referral_requires_shareable_enquiry
BEFORE INSERT ON referral
WHEN (SELECT consent_shared_with_tailor <> 1 OR anonymised_at IS NOT NULL FROM enquiry WHERE id = NEW.enquiry_id)
BEGIN
  SELECT RAISE(ABORT, 'referral requires an enquiry with sharing consent and live data');
END;

CREATE TRIGGER referral_update_requires_approved_tailor
BEFORE UPDATE OF tailor_id ON referral
WHEN (SELECT status FROM tailor WHERE id = NEW.tailor_id) <> 'approved'
BEGIN
  SELECT RAISE(ABORT, 'referral requires an approved tailor');
END;

CREATE TRIGGER referral_update_requires_shareable_enquiry
BEFORE UPDATE OF enquiry_id ON referral
WHEN (SELECT consent_shared_with_tailor <> 1 OR anonymised_at IS NOT NULL FROM enquiry WHERE id = NEW.enquiry_id)
BEGIN
  SELECT RAISE(ABORT, 'referral requires an enquiry with sharing consent and live data');
END;

CREATE TABLE internal_note (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  author_id INTEGER NOT NULL REFERENCES admin_user (id) ON DELETE RESTRICT,
  enquiry_id INTEGER REFERENCES enquiry (id) ON DELETE CASCADE,
  tailor_id INTEGER REFERENCES tailor (id) ON DELETE CASCADE,
  referral_id INTEGER REFERENCES referral (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((enquiry_id IS NOT NULL) + (tailor_id IS NOT NULL) + (referral_id IS NOT NULL) = 1)
);
CREATE INDEX internal_note_enquiry ON internal_note (enquiry_id);
CREATE INDEX internal_note_tailor ON internal_note (tailor_id);
CREATE INDEX internal_note_referral ON internal_note (referral_id);


-- "Stay updated" sign-ups from the footer (FR-PUB-08). Off unless NEWSLETTER_ENABLED is exactly "true": no sender exists yet (OQ-06)
-- and the Privacy text must cover it first (OQ-08). Only the address and the consent record are kept; the owner removes an address on request.
CREATE TABLE newsletter_signup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) BETWEEN 6 AND 254),
  consent_text_version TEXT NOT NULL CHECK (length(consent_text_version) > 0),
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
