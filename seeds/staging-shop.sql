-- Staging sample shop: 10 made-up products with Timor-style woven cloth, shirts, a blazer, fabric and tailoring tools, using the site's own licensed scene photos
-- (no photo storage needed: src/modules/media/stand-in.ts). Prices and products are samples for testing. STAGING ONLY: never load this on production.
--   npx wrangler d1 execute DB --remote --env staging --file=seeds/staging-shop.sql
-- Safe to run again (it removes the earlier sample rows first). Remove with seeds/staging-shop-remove.sql. Sample rows are recognised by a `sample-` slug and
-- the fixed published_at below.

DELETE FROM product WHERE slug LIKE 'sample-%' AND published_at = '2026-01-01T00:00:00.000Z';

INSERT INTO product (slug, name, category_id, description, details, features, price_cents, price_note, availability, is_published, published_at, is_featured)
VALUES ('sample-woven-scarf', 'Woven Scarf, Timor Style', (SELECT id FROM product_category WHERE slug = 'accessories'), 'A hand-woven scarf in warm earth colours with a geometric border, inspired by the woven cloths of Timor-Leste. Wear it at the neck or over the shoulders. (Sample product for testing the shop.)', 'Length 180 cm
Handwoven pattern
Hand wash cold', 'Soft cotton yarn
Fringed ends
Each piece slightly different', 1800, NULL, 'available', 1, '2026-01-01T00:00:00.000Z', 1);
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-woven-scarf'), '39c9a3afdd5bfa0417c833a622d60001' , 'Woven Scarf, Timor Style, photo 1', 1, 1, '2026-01-01');
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-woven-scarf'), '7e86cb62f18f0026e6b3a6d207d60002' , 'Woven Scarf, Timor Style, photo 2', 2, 1, '2026-01-01');

INSERT INTO product (slug, name, category_id, description, details, features, price_cents, price_note, availability, is_published, published_at, is_featured)
VALUES ('sample-woven-table-runner', 'Woven Table Runner', (SELECT id FROM product_category WHERE slug = 'accessories'), 'A long woven runner that brings a Timorese pattern to the dining table. Good for family meals and celebrations. (Sample product for testing the shop.)', 'Length 150 cm, width 35 cm
Patterned weave
Dry clean or gentle hand wash', 'Tightly woven
Strong, lasting colours
Finished edges', 2200, NULL, 'available', 1, '2026-01-01T00:00:00.000Z', 0);
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-woven-table-runner'), '39c9a3afdd5bfa0417c833a622d60003' , 'Woven Table Runner, photo 1', 1, 1, '2026-01-01');
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-woven-table-runner'), '6894d20bd7d25bcc3923f684a84a0004' , 'Woven Table Runner, photo 2', 2, 1, '2026-01-01');

INSERT INTO product (slug, name, category_id, description, details, features, price_cents, price_note, availability, is_published, published_at, is_featured)
VALUES ('sample-woven-cushion-cover', 'Woven Cushion Cover', (SELECT id FROM product_category WHERE slug = 'accessories'), 'A cushion cover made from woven cloth with a traditional border. Gives a plain sofa a local look. (Sample product for testing the shop.)', '45 x 45 cm
Hidden zip
Cover only, no cushion', 'Hard-wearing cloth
Washable at 30 degrees
Pattern on both sides', 1400, NULL, 'available', 1, '2026-01-01T00:00:00.000Z', 0);
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-woven-cushion-cover'), '39c9a3afdd5bfa0417c833a622d60005' , 'Woven Cushion Cover, photo 1', 1, 1, '2026-01-01');

INSERT INTO product (slug, name, category_id, description, details, features, price_cents, price_note, availability, is_published, published_at, is_featured)
VALUES ('sample-ceremonial-shirt', 'Ceremonial Shirt with Woven Trim', (SELECT id FROM product_category WHERE slug = 'exclusive-collection'), 'A crisp cotton shirt with a woven panel at the collar and cuffs, made for ceremonies and family occasions in Dili. (Sample product for testing the shop.)', 'Sizes S to XXL
Long sleeve
White or sand', 'Woven collar and cuff trim
Mother-of-pearl style buttons
Made to order, allow two weeks', 6500, NULL, 'available', 1, '2026-01-01T00:00:00.000Z', 1);
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-ceremonial-shirt'), 'e70d3729e044294c1bb44280ec590006' , 'Ceremonial Shirt with Woven Trim, photo 1', 1, 1, '2026-01-01');
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-ceremonial-shirt'), '39c9a3afdd5bfa0417c833a622d60007' , 'Ceremonial Shirt with Woven Trim, photo 2', 2, 1, '2026-01-01');

INSERT INTO product (slug, name, category_id, description, details, features, price_cents, price_note, availability, is_published, published_at, is_featured)
VALUES ('sample-woven-wrap-skirt', 'Woven Wrap Skirt', (SELECT id FROM product_category WHERE slug = 'ready-made'), 'A wrap skirt in woven cloth, to wear to church, ceremonies or a day out. Ties at the waist to fit most sizes. (Sample product for testing the shop.)', 'One size, ties at the waist
Length 85 cm
Hand wash', 'Woven pattern
Lined waistband
Easy to alter', 3800, NULL, 'available', 1, '2026-01-01T00:00:00.000Z', 1);
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-woven-wrap-skirt'), '39c9a3afdd5bfa0417c833a622d60008' , 'Woven Wrap Skirt, photo 1', 1, 1, '2026-01-01');
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-woven-wrap-skirt'), 'f08238d664d294a6e120a03add840009' , 'Woven Wrap Skirt, photo 2', 2, 1, '2026-01-01');

INSERT INTO product (slug, name, category_id, description, details, features, price_cents, price_note, availability, is_published, published_at, is_featured)
VALUES ('sample-dili-linen-shirt', 'Dili Linen Shirt', (SELECT id FROM product_category WHERE slug = 'ready-made'), 'A light linen shirt cut for hot, humid days. Quick to dry and easy to wash. (Sample product for testing the shop.)', 'Sizes S to XXL
Short or long sleeve
Sky blue, white or sand', 'Breathable linen blend
Relaxed straight fit
Chest pocket', 3200, NULL, 'available', 1, '2026-01-01T00:00:00.000Z', 1);
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-dili-linen-shirt'), 'e70d3729e044294c1bb44280ec59000a' , 'Dili Linen Shirt, photo 1', 1, 1, '2026-01-01');
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-dili-linen-shirt'), '95c72f7f580c017382dbd2f88511000b' , 'Dili Linen Shirt, photo 2', 2, 1, '2026-01-01');

INSERT INTO product (slug, name, category_id, description, details, features, price_cents, price_note, availability, is_published, published_at, is_featured)
VALUES ('sample-black-blazer', 'Formal Black Blazer', (SELECT id FROM product_category WHERE slug = 'exclusive-collection'), 'A fully lined single-breasted blazer in a dark, hard-wearing cloth for weddings, church and office days. (Sample product for testing the shop.)', 'Sizes 36 to 48
Two-button front
Fully lined', 'Hand-finished lapel
Working cuff buttons
Two inside pockets', 12000, NULL, 'available', 1, '2026-01-01T00:00:00.000Z', 0);
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-black-blazer'), '960576db61b7127ce4d76b7ba398000c' , 'Formal Black Blazer, photo 1', 1, 1, '2026-01-01');
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-black-blazer'), '33cac41117718382a2c60553f15d000d' , 'Formal Black Blazer, photo 2', 2, 1, '2026-01-01');

INSERT INTO product (slug, name, category_id, description, details, features, price_cents, price_note, availability, is_published, published_at, is_featured)
VALUES ('sample-school-uniform-set', 'School Uniform Set', (SELECT id FROM product_category WHERE slug = 'ready-made'), 'A shirt and shorts or skirt set in school colours, sewn with strong seams to last a full school year. (Sample product for testing the shop.)', 'Ages 6 to 16
Shirt and shorts or skirt
Double-stitched seams', 'Colour-fast fabric
Room to grow in the hem
Easy-care', 2800, 'per set', 'available', 1, '2026-01-01T00:00:00.000Z', 0);
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-school-uniform-set'), '147ee7a3fa3e4708f7b3b58488c9000e' , 'School Uniform Set, photo 1', 1, 1, '2026-01-01');

INSERT INTO product (slug, name, category_id, description, details, features, price_cents, price_note, availability, is_published, published_at, is_featured)
VALUES ('sample-cotton-fabric', 'Cotton Fabric, by the Metre', (SELECT id FROM product_category WHERE slug = 'fabrics'), 'A deep blue cotton cloth that is easy to cut and sew. Good for shirts, trousers, bags and cushion covers. (Sample product for testing the shop.)', 'Sold by the metre
150 cm wide
Pre-washed', 'Medium weight
Soft hand-feel
Takes a crisp press', 950, 'per metre', 'available', 1, '2026-01-01T00:00:00.000Z', 0);
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-cotton-fabric'), 'b2bdd0114b4bc4599df285ae1028000f' , 'Cotton Fabric, by the Metre, photo 1', 1, 1, '2026-01-01');
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-cotton-fabric'), '7e86cb62f18f0026e6b3a6d207d60010' , 'Cotton Fabric, by the Metre, photo 2', 2, 1, '2026-01-01');

INSERT INTO product (slug, name, category_id, description, details, features, price_cents, price_note, availability, is_published, published_at, is_featured)
VALUES ('sample-sewing-kit', 'Tailor''s Sewing Kit', (SELECT id FROM product_category WHERE slug = 'accessories'), 'Everything for a quick repair at home: needles, strong thread in six colours, spare buttons, pins and small scissors. (Sample product for testing the shop.)', 'Needles and pins
Six thread colours
Spare buttons and a thimble', 'Fits in a pocket
Hard-wearing case
Good for travel', 1200, NULL, 'available', 1, '2026-01-01T00:00:00.000Z', 0);
INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date)
VALUES ((SELECT id FROM product WHERE slug = 'sample-sewing-kit'), 'fe9e7d9903f4d1d6273c09b645650011' , 'Tailor''s Sewing Kit, photo 1', 1, 1, '2026-01-01');
