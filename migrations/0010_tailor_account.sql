-- tailor_account: A tailor sign-in account, one per tailor, made when staff approve a join request. Serves FR-TPO-*.

CREATE TABLE tailor_account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tailor_id INTEGER NOT NULL UNIQUE REFERENCES tailor (id) ON DELETE CASCADE,
  email TEXT UNIQUE COLLATE NOCASE CHECK (email IS NULL OR length(email) > 3),
  password_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  -- Permission to show their details and photos (BR-06): the wording version they agreed to, and when.
  consent_version TEXT,
  consent_at TEXT,
  review_requested_at TEXT, -- "ready for review" (FR-TPO-06); publishing stays with staff, this only tells them to look
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((email IS NULL) = (password_hash IS NULL)) -- both stay empty until the invite is accepted
);
