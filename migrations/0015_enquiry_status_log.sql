-- enquiry_status_log: The history of an enquiry's status changes. Serves FR-ENQ-*, FR-RPT-*.

CREATE TABLE enquiry_status_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL REFERENCES enquiry (id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('new', 'contacted', 'referred', 'accepted_by_tailor', 'completed_reported', 'not_converted', 'cancelled')),
  changed_by INTEGER REFERENCES admin_user (id) ON DELETE SET NULL,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX enquiry_status_log_enquiry ON enquiry_status_log (enquiry_id, changed_at);
