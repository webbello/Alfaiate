-- Phase 8 prep: cookie-free visit counts for the owner (ANA-01). One row per Dili Dili day, public page (a Tetum page has its own path) and referring group, with a count.
-- No IP address, no user agent, no cookie, no visitor id: nothing here can identify a person. Visits from bots and from browsers that send
-- Do Not Track or Global Privacy Control are not counted.
CREATE TABLE page_view_daily (
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  path TEXT NOT NULL CHECK (length(path) BETWEEN 1 AND 120 AND substr(path, 1, 1) = '/'),
  referrer TEXT NOT NULL CHECK (length(referrer) BETWEEN 1 AND 60),
  count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1),
  PRIMARY KEY (day, path, referrer)
);
