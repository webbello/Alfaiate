-- Tailor portal (docs/SPEC-tailor-portal.md, FR-TPO-*): a separate sign-in for tailors, so a tailor session can never be accepted by an admin page.
-- admin_user is not touched: rebuilding it would delete every staff session and blank the audit trail.
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

-- The owner's decision on a join request (FR-TPO-01).
ALTER TABLE tailor_interest ADD COLUMN decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'declined'));
ALTER TABLE tailor_interest ADD COLUMN tailor_id INTEGER REFERENCES tailor (id) ON DELETE SET NULL;
ALTER TABLE tailor_interest ADD COLUMN decided_at TEXT;

-- Who acted when it was a tailor and not staff (FR-TPO-08).
ALTER TABLE audit_log ADD COLUMN tailor_account_id INTEGER REFERENCES tailor_account (id) ON DELETE SET NULL;
