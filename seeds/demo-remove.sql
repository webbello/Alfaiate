-- Removes exactly the rows seeds/demo.sql adds. Each rule needs TWO markers, so a real row is never matched by accident:
--   enquiries: source 'demo data' AND a made-up number (+6707000...); join requests: consent version 'join-consent-demo' AND a made-up number; tailors: one of the nine demo slugs AND a made-up private phone.
-- Enquiries go first (their status log, notes and referrals go with them), then join requests, then tailors (their links, accounts, tap counts and notes go with them).
-- The launch lists of categories and areas that `npm run db:demo` loads are real and stay. One statement per line.
DELETE FROM enquiry WHERE source = 'demo data' AND contact_number_e164 LIKE '+6707000%';
DELETE FROM tailor_interest WHERE consent_text_version = 'join-consent-demo' AND phone_e164 LIKE '+6707000%';
DELETE FROM tailor WHERE slug IN ('atelier-lorosae', 'tais-moderna', 'alfaiataria-sentru', 'hera-fashion-studio', 'maubere-uniform-works', 'baucau-stitch-and-style', 'fatumeta-tailoring', 'liquica-alterasaun', 'old-town-tailors') AND private_phone LIKE '+6707000%';
-- Earlier versions of the demo data used [Demo] names, demo- slugs and AT-DEMO references; clear those too.
DELETE FROM enquiry WHERE reference_code LIKE 'AT-DEMO%';
DELETE FROM tailor WHERE slug LIKE 'demo-%' AND display_name LIKE '[Demo]%';
DELETE FROM garment_category WHERE slug LIKE 'demo-%' AND name LIKE '[Demo]%';
DELETE FROM service_area WHERE slug LIKE 'demo-%' AND name LIKE '[Demo]%';
