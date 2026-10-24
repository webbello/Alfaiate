-- internal_note: Staff notes on one enquiry, tailor or referral; private. Serves FR-ADM-*.

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
