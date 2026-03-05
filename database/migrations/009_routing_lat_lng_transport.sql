-- Lat/lng for map plotting (from Place Details); per-leg transport mode.
ALTER TABLE routing ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE routing ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE routing ADD COLUMN IF NOT EXISTS transport_to_next TEXT DEFAULT 'default'; -- 'default' | 'fly' | 'drive'
