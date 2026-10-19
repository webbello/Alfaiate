-- Phase 7d: business, school and organisation enquiries (FR-ENQ-09) reuse the enquiry table and workflow. Two optional columns hold
-- what only a group order has; `source` is 'business' for these. Both are cleared by the anonymise routine like the other free text.
ALTER TABLE enquiry ADD COLUMN organisation_name TEXT CHECK (organisation_name IS NULL OR length(organisation_name) <= 100);
ALTER TABLE enquiry ADD COLUMN group_size_text TEXT CHECK (group_size_text IS NULL OR length(group_size_text) <= 40);
