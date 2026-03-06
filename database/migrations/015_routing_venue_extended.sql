-- Extended venue data from Google Places (website, phone, capacity).
-- Used to pre-fill advance Venue Info section.
ALTER TABLE routing ADD COLUMN IF NOT EXISTS venue_website TEXT;
ALTER TABLE routing ADD COLUMN IF NOT EXISTS venue_phone TEXT;
ALTER TABLE routing ADD COLUMN IF NOT EXISTS venue_capacity INT;
