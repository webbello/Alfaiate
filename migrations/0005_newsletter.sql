-- Phase 7d: "Stay updated" sign-ups from the footer (FR-PUB-08). Off unless NEWSLETTER_ENABLED is exactly "true": no sender exists yet (OQ-06)
-- and the Privacy text must cover it first (OQ-08). Only the address and the consent record are kept; the owner removes an address on request.
CREATE TABLE newsletter_signup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) BETWEEN 6 AND 254),
  consent_text_version TEXT NOT NULL CHECK (length(consent_text_version) > 0),
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
