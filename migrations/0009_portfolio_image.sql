-- portfolio_image: A tailor photo (metadata only; bytes are in R2), public only with permission; one may be the profile photo. Serves FR-PRO-*, BR-06.

-- Photo metadata only: the bytes live in R2 under file_key. A photo is public only when its tailor is published and permission_granted (BR-06).
CREATE TABLE portfolio_image (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tailor_id INTEGER NOT NULL REFERENCES tailor (id) ON DELETE CASCADE,
  file_key TEXT NOT NULL UNIQUE CHECK (length(file_key) > 0),
  alt_text TEXT NOT NULL CHECK (length(trim(alt_text)) > 0),
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  permission_granted INTEGER NOT NULL DEFAULT 0 CHECK (permission_granted IN (0, 1)),
  permission_date TEXT,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  is_profile_photo INTEGER NOT NULL DEFAULT 0 CHECK (is_profile_photo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX portfolio_image_tailor ON portfolio_image (tailor_id, sort_order);

-- At most one profile photo per tailor, and no pointer on tailor (so no circular reference between the two tables).
CREATE UNIQUE INDEX portfolio_image_one_profile_photo ON portfolio_image (tailor_id) WHERE is_profile_photo = 1;
