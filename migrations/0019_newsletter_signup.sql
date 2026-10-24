-- newsletter_signup: Footer "Stay updated" sign-ups; off until a sender exists. Serves FR-PUB-08.

CREATE TABLE newsletter_signup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) BETWEEN 6 AND 254),
  consent_text_version TEXT NOT NULL CHECK (length(consent_text_version) > 0),
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
