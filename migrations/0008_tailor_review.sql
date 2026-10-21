-- The tailor's "ready for review" request (FR-TPO-06). Publishing stays with staff; this only tells them to look.
ALTER TABLE tailor_account ADD COLUMN review_requested_at TEXT;
