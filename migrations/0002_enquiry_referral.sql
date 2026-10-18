-- Alfaiate TL schema, part 2: private customer/referral tables and operational tables
-- (DATA_MODEL §3.7-3.10, 3.12). Everything here is admin-only data (BR-07).

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
  anonymised_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Live enquiries need a name, number and channel (PRV-01).
  CHECK (anonymised_at IS NOT NULL OR (customer_name IS NOT NULL AND length(trim(customer_name)) > 0 AND contact_number_e164 IS NOT NULL AND contact_channel IS NOT NULL)),
  -- Anonymised enquiries keep reporting fields only (PRV-04).
  CHECK (anonymised_at IS NULL OR (customer_name IS NULL AND contact_number_e164 IS NULL AND notes IS NULL AND service_description IS NULL AND area_text IS NULL AND preferred_datetime_text IS NULL))
);
CREATE INDEX enquiry_status ON enquiry (status, created_at);

CREATE TABLE enquiry_status_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL REFERENCES enquiry (id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('new', 'contacted', 'referred', 'accepted_by_tailor', 'completed_reported', 'not_converted', 'cancelled')),
  changed_by INTEGER REFERENCES admin_user (id) ON DELETE SET NULL,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX enquiry_status_log_enquiry ON enquiry_status_log (enquiry_id, changed_at);

-- Private customer reference images (FR-ENQ-07, Should): metadata only, bytes in the private R2 bucket.
CREATE TABLE enquiry_attachment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL REFERENCES enquiry (id) ON DELETE CASCADE,
  file_key TEXT NOT NULL UNIQUE CHECK (length(file_key) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

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

-- Aggregate counts only; no visitor data (ANA-02, PRV-05).
CREATE TABLE contact_click_daily (
  tailor_id INTEGER NOT NULL REFERENCES tailor (id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'phone')),
  date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (tailor_id, channel, date)
);

-- Transient counters (login and form rate limits); Workers memory is not shared across instances.
CREATE TABLE rate_limit (
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (key_hash, window_start)
);
