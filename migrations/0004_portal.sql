-- Alfaiate TL baseline 4 of 6: the tailor portal and join requests (docs/SPEC-tailor-portal.md, FR-JOIN-*, FR-TPO-*).
-- A separate sign-in for tailors, so a tailor session can never be accepted by an admin page.
-- tailor_interest is NOT a registration: nothing here is public. Staff call or approve; approving makes a draft tailor and an account.

-- Join requests ('Join us' form). Personal fields are removable like an enquiry's (PRV-04).
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
  -- The owner's decision on a join request (FR-TPO-01); tailor_id is the draft profile made when it was approved.
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'declined')),
  tailor_id INTEGER REFERENCES tailor (id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (anonymised_at IS NOT NULL OR (contact_name IS NOT NULL AND length(trim(contact_name)) > 0 AND phone_e164 IS NOT NULL)),
  CHECK (anonymised_at IS NULL OR (contact_name IS NULL AND business_name IS NULL AND phone_e164 IS NULL AND area_text IS NULL AND craft_text IS NULL AND message IS NULL))
);
CREATE INDEX tailor_interest_created ON tailor_interest (created_at);
CREATE INDEX tailor_interest_tailor ON tailor_interest (tailor_id);

CREATE TABLE tailor_account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tailor_id INTEGER NOT NULL UNIQUE REFERENCES tailor (id) ON DELETE CASCADE,
  -- Both stay empty until the tailor accepts their invite.
  email TEXT UNIQUE COLLATE NOCASE CHECK (email IS NULL OR length(email) > 3),
  password_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  -- Permission to show their details and photos (BR-06): wording version and time.
  consent_version TEXT,
  consent_at TEXT,
  last_login_at TEXT,
  -- Set when the tailor presses "ready for review" (FR-TPO-06). Publishing stays with staff; this only tells them to look.
  review_requested_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((email IS NULL) = (password_hash IS NULL))
);

CREATE TABLE tailor_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  tailor_account_id INTEGER NOT NULL REFERENCES tailor_account (id) ON DELETE CASCADE,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX tailor_session_account ON tailor_session (tailor_account_id);

-- Single-use invite links: only the hash of the token is stored.
CREATE TABLE tailor_invite (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tailor_account_id INTEGER NOT NULL REFERENCES tailor_account (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX tailor_invite_account ON tailor_invite (tailor_account_id);

