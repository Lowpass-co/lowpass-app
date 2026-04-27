-- Ensures rider_sections.section_type exists (idempotent).
-- If this runs alone, also apply 040_channel_list.sql for channel_list_rows,
-- sub_snakes, mic_library, and RLS or those features will fail later.
DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rider_section_type') THEN
    CREATE TYPE rider_section_type AS ENUM ('fields', 'channel_list');
  END IF;
END
$t$;

ALTER TABLE rider_sections
  ADD COLUMN IF NOT EXISTS section_type rider_section_type NOT NULL DEFAULT 'fields';

-- Nudge PostgREST / Supabase API to pick up the new column (stale cache fix).
NOTIFY pgrst, 'reload schema';
