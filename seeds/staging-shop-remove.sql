-- Removes the staging sample shop (seeds/staging-shop.sql). Photos go with the products.
DELETE FROM product WHERE slug LIKE 'sample-%' AND published_at = '2026-01-01T00:00:00.000Z';
