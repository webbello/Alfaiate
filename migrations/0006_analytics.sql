-- Alfaiate TL baseline 6 of 6: aggregate counters only. Nothing here can identify a person (ANA-01, ANA-02, PRV-05).

-- Contact taps per tailor, channel and day.
CREATE TABLE contact_click_daily (
  tailor_id INTEGER NOT NULL REFERENCES tailor (id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'phone')),
  date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (tailor_id, channel, date)
);

-- Cookie-free visit counts for the owner: one row per Dili day, public page (a Tetum page has its own path) and referring group.
-- No IP address, no user agent, no cookie, no visitor id. Visits from bots and from browsers that send Do Not Track or
-- Global Privacy Control are not counted.
CREATE TABLE page_view_daily (
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  path TEXT NOT NULL CHECK (length(path) BETWEEN 1 AND 120 AND substr(path, 1, 1) = '/'),
  referrer TEXT NOT NULL CHECK (length(referrer) BETWEEN 1 AND 60),
  count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1),
  PRIMARY KEY (day, path, referrer)
);
