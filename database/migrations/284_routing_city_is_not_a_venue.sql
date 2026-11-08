/* ============================================================
   MIGRATION 284 — a city is not a venue (Nov 2026, Adam)

   Days off and travel days kept ending up with the city in the venue
   ("Off · London · venue: London"): typed into the Venue box, picked from
   Google, or copied from a tour book. It then showed on the Advance board and
   Schedule as if it were a venue.

   1. A trigger on routing: whenever venue_name or city is written and the
      venue is just the city ("London", "london", "London, UK"), the venue is
      emptied — with its phone / website / capacity and library link. Every
      writer goes through it, including ones added later. (The app applies
      the same rule first, accents included — src/lib/venues/notAVenue.ts.)
   2. A one-off clean of the rows already saved that way.

   NOT touched: the shared venue library (canonical_venues). A Google pick of
   "London" there made a library "venue" called London; that table is shared
   across workspaces, so nothing is deleted here. The query at the end lists
   them for a look.

   HAND-PASTE into the Supabase SQL editor. Idempotent — a re-run is a no-op.
   ============================================================ */

CREATE OR REPLACE FUNCTION public.routing_venue_is_city(venue text, city text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(btrim(venue), '') <> ''
     AND coalesce(btrim(city), '') <> ''
     AND (
       lower(regexp_replace(btrim(venue), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(city), '\s+', ' ', 'g'))
       OR lower(regexp_replace(btrim(split_part(venue, ',', 1)), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(city), '\s+', ' ', 'g'))
     );
$$;

CREATE OR REPLACE FUNCTION public.routing_drop_city_venue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.routing_venue_is_city(NEW.venue_name, NEW.city) THEN
    NEW.venue_name := NULL;
    NEW.venue_phone := NULL;
    NEW.venue_website := NULL;
    NEW.venue_capacity := NULL;
    NEW.canonical_venue_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS routing_drop_city_venue ON public.routing;
CREATE TRIGGER routing_drop_city_venue
  BEFORE INSERT OR UPDATE OF venue_name, city ON public.routing
  FOR EACH ROW EXECUTE FUNCTION public.routing_drop_city_venue();

-- The rows already saved that way (the trigger empties them on this write).
-- Guarded, so a re-run touches nothing.
UPDATE public.routing
SET venue_name = venue_name
WHERE public.routing_venue_is_city(venue_name, city);

-- For a look only (nothing changes): library "venues" that are just a city.
-- SELECT id, name, city, country, google_place_id FROM public.canonical_venues
-- WHERE public.routing_venue_is_city(name, city) ORDER BY name;

-- ---------- down ----------
-- DROP TRIGGER IF EXISTS routing_drop_city_venue ON public.routing;
-- DROP FUNCTION IF EXISTS public.routing_drop_city_venue();
-- DROP FUNCTION IF EXISTS public.routing_venue_is_city(text, text);
-- (The cleaned rows are not restored: their venue was the city, which is
--  still in city.)
