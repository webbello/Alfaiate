-- admin_user: Staff accounts for the admin (owner, manager, editor, viewer); never deleted, only deactivated. Serves FR-ADM-*, SEC-09.
-- Conventions for the whole schema (one file per table, in dependency order; a file only references tables from earlier files):
--   * Singular table names; a foreign key column is <table>_id; every table has an integer id unless its key is natural.
--   * Timestamps are UTC ISO-8601 text in *_at columns; calendar dates are text in *_on / *_date columns; booleans are 0/1 in is_* columns
--     (the legacy names category_id, area_id, permission_date, permission_recorded, permission_granted and contact_publish_consent are kept: they are also admin form field names).
--   * Enums are CHECK-constrained text. Phone numbers are *_e164 columns with one shape: '+', a non-zero digit, digits only, 8 to 16 characters.
--     SQLite has no reusable CHECK, so the expression is written out each time and tests/workers/schema-conventions.test.ts proves every copy matches.
--   * Launch categories and areas are not migrations: seeds/launch.sql loads them once.

CREATE TABLE admin_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) > 3),
  password_hash TEXT NOT NULL, -- the whole 'pbkdf2-sha256$iterations$salt$hash' string
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'editor', 'viewer')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
