-- Shop: the product page's panels (details, features, returns) and the "most loved" slider flag. One item a line in the text fields.
ALTER TABLE product ADD COLUMN details TEXT;
ALTER TABLE product ADD COLUMN features TEXT;
ALTER TABLE product ADD COLUMN returns TEXT;
ALTER TABLE product ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1));
