-- contact_click_daily: Contact taps per tailor, channel and day; counts only. Serves ANA-02.

-- Contact taps per tailor, channel and day (ANA-02). Counts only.
CREATE TABLE contact_click_daily (
  tailor_id INTEGER NOT NULL REFERENCES tailor (id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'phone')),
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (tailor_id, channel, day)
);
