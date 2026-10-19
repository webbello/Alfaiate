-- Removes exactly the rows seeds/demo.sql adds: enquiries with an AT-DEMO reference (their status log and referrals go with them), tailors with a demo- slug (their links, tap counts and notes go with them), then the demo categories and areas. One statement per line.
DELETE FROM enquiry WHERE reference_code LIKE 'AT-DEMO%';
DELETE FROM tailor WHERE slug LIKE 'demo-%';
DELETE FROM garment_category WHERE slug LIKE 'demo-%';
DELETE FROM service_area WHERE slug LIKE 'demo-%';
