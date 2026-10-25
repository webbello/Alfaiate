-- referral: Handing an enquiry to one tailor by hand, the tailor's response, the reported outcome and the fee record. Serves FR-REF-*, BR-08, BR-10.

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
  -- The tailor's inbox (FR-TPO-09..12): when staff sent this referral to the tailor's portal (NULL = the tailor sees nothing), and the reason a tailor gave on declining.
  shared_to_inbox_at TEXT,
  decline_reason TEXT CHECK (decline_reason IS NULL OR decline_reason IN ('too_far', 'too_busy', 'not_my_work', 'other')),
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
