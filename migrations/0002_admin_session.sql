-- admin_session: Staff sign-in sessions (cookie token stored only as a hash). Serves SEC-03.

-- Only the SHA-256 hash of the cookie token is stored. Expires when idle (last_seen_at) or at expires_at, whichever is first.
CREATE TABLE admin_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  admin_user_id INTEGER NOT NULL REFERENCES admin_user (id) ON DELETE CASCADE,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  -- "Keep me signed in on this device" (FR-ADM-18): a session that renews itself on use for 30 days instead of ending after 30 idle minutes or 12 hours.
  keep_signed_in INTEGER NOT NULL DEFAULT 0 CHECK (keep_signed_in IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX admin_session_user ON admin_session (admin_user_id);
