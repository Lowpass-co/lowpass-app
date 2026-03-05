-- Default day_type to empty (no type selected) for new routing rows.
-- Existing rows are unchanged; only new inserts use the new default.
ALTER TABLE routing ALTER COLUMN day_type SET DEFAULT '';
