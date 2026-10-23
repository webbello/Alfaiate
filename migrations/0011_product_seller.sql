-- Shop S4: approved tailors list their own products (docs/SPEC-shop.md, BR-14). A product with seller_tailor_id is public only while that tailor
-- is published with recorded permission, and each of its photos needs the permission the tailor confirmed at upload (default 1 for the platform's own photos).
ALTER TABLE product_image ADD COLUMN permission_granted INTEGER NOT NULL DEFAULT 1 CHECK (permission_granted IN (0, 1));
ALTER TABLE product_image ADD COLUMN permission_date TEXT;
CREATE INDEX product_seller ON product (seller_tailor_id);
