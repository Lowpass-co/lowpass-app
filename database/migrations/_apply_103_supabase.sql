/* ============================================================
   APPLY 103 in Supabase SQL Editor (routing.country column)

   Adds a nullable `country` text column to routing so the
   calendar's Show cells can render "City, Country" without
   re-joining venues per row.

   Idempotent — IF NOT EXISTS handles workspaces that already
   have the column from direct-paste history.
   ============================================================ */

ALTER TABLE public.routing
  ADD COLUMN IF NOT EXISTS country TEXT;

COMMENT ON COLUMN public.routing.country IS
  'Denormalised country, captured from Google Places at venue-select time. May be the country name ("Germany") or an ISO-2 code ("DE") depending on provider. Render via the calendar formatCountry() helper.';


-- Tracking insert
INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES
  ('103_routing_country.sql', 'backfill', 'manual-supabase-editor')
ON CONFLICT (filename) DO NOTHING;


/* ============================================================
   Post-apply verification (run separately)

   1. Column exists
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'routing'
        AND column_name = 'country';
      -- Expect: 1 row

   2. Tracking row recorded
      SELECT filename, applied_at FROM public._lp_migrations
      WHERE filename = '103_routing_country.sql';
   ============================================================ */
