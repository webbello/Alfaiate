-- tailor_session: Tailor sign-in sessions, separate from staff sessions so one can never open the other's pages. Serves FR-TPO-*.

CREATE TABLE tailor_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  tailor_account_id INTEGER NOT NULL REFERENCES tailor_account (id) ON DELETE CASCADE,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX tailor_session_account ON tailor_session (tailor_account_id);
