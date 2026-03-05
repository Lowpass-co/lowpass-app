-- Add full address to routing (Google Places autofill).
-- city remains for locality; address holds formatted_address.
ALTER TABLE routing ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
