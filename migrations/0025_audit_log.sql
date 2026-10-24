-- audit_log: Who did what, by ids only; append-only by convention. Serves SEC-10, FR-ADM-*.

-- Who did what, by ids only (never names, numbers or notes). Append-only by convention: the code has no update or delete path.
-- Exactly one actor is set: a staff user or a tailor account (neither when the actor row was later deleted).
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER REFERENCES admin_user (id) ON DELETE SET NULL,
  tailor_account_id INTEGER REFERENCES tailor_account (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) > 0),
  entity_type TEXT,
  entity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (admin_user_id IS NULL OR tailor_account_id IS NULL)
);

CREATE INDEX audit_log_user ON audit_log (admin_user_id, id); -- a person's recent actions, newest first

CREATE INDEX audit_log_tailor_account ON audit_log (tailor_account_id);
