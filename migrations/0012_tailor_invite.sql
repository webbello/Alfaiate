-- tailor_invite: Single-use invite links that let a tailor choose a password. Serves FR-TPO-*.

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
