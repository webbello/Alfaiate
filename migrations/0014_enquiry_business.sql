-- enquiry_business: Extra details of a business, school or organisation enquiry, at most one per enquiry. Serves FR-ENQ-09.

-- Extra details that only a business, school or organisation order has (FR-ENQ-09, source = 'business'): at most one row per enquiry.
-- Personal data like the rest of the enquiry: the anonymise routine deletes the row.
CREATE TABLE enquiry_business (
  enquiry_id INTEGER PRIMARY KEY REFERENCES enquiry (id) ON DELETE CASCADE,
  organisation_name TEXT NOT NULL CHECK (length(trim(organisation_name)) BETWEEN 1 AND 100),
  group_size_text TEXT CHECK (group_size_text IS NULL OR length(group_size_text) <= 40)
);
