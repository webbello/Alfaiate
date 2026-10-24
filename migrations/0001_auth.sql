-- Alfaiate TL baseline 1 of 6: staff accounts, staff sessions, audit trail and rate-limit counters (DATA_MODEL §3.1-3.3, 3.12).
-- Timestamps are UTC ISO-8601 text; booleans are 0/1; enums are CHECK-constrained text.
-- audit_log.tailor_account_id points at a table created in 0004; SQLite resolves foreign keys when rows are written, not when tables are created.

CREATE TABLE admin_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) > 3),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'editor', 'viewer')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  admin_user_id INTEGER NOT NULL REFERENCES admin_user (id) ON DELETE CASCADE,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX session_user ON session (admin_user_id);

-- Append-only by convention; never holds customer data. One of the two actor columns is set (staff or a tailor).
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER REFERENCES admin_user (id) ON DELETE SET NULL,
  tailor_account_id INTEGER REFERENCES tailor_account (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) > 0),
  entity_type TEXT,
  entity_id INTEGER,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- The user page lists a person's recent actions newest first; the second index serves the same lookup for tailors.
CREATE INDEX audit_log_user ON audit_log (admin_user_id, id);
CREATE INDEX audit_log_tailor_account ON audit_log (tailor_account_id);

-- Transient counters (login and form rate limits); Workers memory is not shared across instances.
CREATE TABLE rate_limit (
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (key_hash, window_start)
);
-- Old windows are deleted by window_start on every check.
CREATE INDEX rate_limit_window ON rate_limit (window_start);
