-- page_view_daily: Cookie-free visit counts per day, page and referring group. Serves ANA-01.

-- Cookie-free visit counts (ANA-01): one row per Dili day, public page (a Tetum page has its own path) and referring group.
-- No IP address, user agent, cookie or visitor id. Bots and browsers sending Do Not Track or Global Privacy Control are not counted.
CREATE TABLE page_view_daily (
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  path TEXT NOT NULL CHECK (length(path) BETWEEN 1 AND 120 AND substr(path, 1, 1) = '/'),
  referrer TEXT NOT NULL CHECK (length(referrer) BETWEEN 1 AND 60),
  count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1),
  PRIMARY KEY (day, path, referrer)
);
