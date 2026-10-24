-- rate_limit: Transient counters that limit sign-in attempts and public form sends. Serves SEC-06, SEC-07.

CREATE TABLE rate_limit (
  key_hash TEXT NOT NULL, -- a hash, never the address itself
  window_start INTEGER NOT NULL, -- epoch seconds
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (key_hash, window_start)
);

CREATE INDEX rate_limit_window ON rate_limit (window_start); -- old windows are deleted by this column on every check
