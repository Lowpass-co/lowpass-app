-- ============================================
-- LOWPASS — rooming "Last updated" stamp
-- Migration 273
-- ============================================
--
-- Paste into the Supabase SQL Editor and Run. Safe to paste twice: the column
-- is ADD … IF NOT EXISTS, the function is CREATE OR REPLACE, and each trigger
-- is dropped before it is re-created.
--
-- WHY. Adam's rooming sheet shows when it was last updated. Nothing recorded
-- that: room_assignments only has created_at, and changing someone's room
-- (an UPDATE of room_id) or removing them (a DELETE) left no trace.
--
-- WHAT. tours.rooming_updated_at, stamped by triggers on every insert / update
-- / delete of hotels, rooms and room_assignments — so every writer (the
-- matrix, the Cards and Nights views, the hotel sheet, the API) is covered
-- without any of them having to remember. The rooming page reads it from
-- GET /api/budget/rooming (null until this migration is pasted).
--
-- SECURITY. The function is SECURITY DEFINER so a member who may edit rooms
-- but not the tour row can still move the stamp. It only ever sets this one
-- column, on the tour the written row already belongs to (which RLS allowed
-- the write on), with a pinned search_path.
-- ============================================

ALTER TABLE public.tours
  ADD COLUMN IF NOT EXISTS rooming_updated_at timestamptz;

COMMENT ON COLUMN public.tours.rooming_updated_at IS
  'When any hotel / room / room assignment on this tour last changed. Trigger-maintained (migration 273).';

CREATE OR REPLACE FUNCTION public.lp_touch_rooming_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tour uuid;
BEGIN
  IF TG_TABLE_NAME = 'hotels' THEN
    IF TG_OP = 'DELETE' THEN v_tour := OLD.tour_id; ELSE v_tour := NEW.tour_id; END IF;
  ELSIF TG_TABLE_NAME = 'rooms' THEN
    SELECT h.tour_id INTO v_tour FROM public.hotels h
     WHERE h.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.hotel_id ELSE NEW.hotel_id END;
  ELSIF TG_TABLE_NAME = 'room_assignments' THEN
    SELECT h.tour_id INTO v_tour FROM public.rooms r JOIN public.hotels h ON h.id = r.hotel_id
     WHERE r.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.room_id ELSE NEW.room_id END;
  END IF;

  -- A cascade from a deleted hotel finds no parent: the hotel's own trigger
  -- already stamped the tour, so nothing is lost.
  IF v_tour IS NOT NULL THEN
    UPDATE public.tours SET rooming_updated_at = now() WHERE id = v_tour;
  END IF;
  RETURN NULL; -- AFTER trigger: return value ignored
END;
$$;

REVOKE ALL ON FUNCTION public.lp_touch_rooming_updated_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS hotels_touch_rooming ON public.hotels;
CREATE TRIGGER hotels_touch_rooming
  AFTER INSERT OR UPDATE OR DELETE ON public.hotels
  FOR EACH ROW EXECUTE FUNCTION public.lp_touch_rooming_updated_at();

DROP TRIGGER IF EXISTS rooms_touch_rooming ON public.rooms;
CREATE TRIGGER rooms_touch_rooming
  AFTER INSERT OR UPDATE OR DELETE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.lp_touch_rooming_updated_at();

DROP TRIGGER IF EXISTS room_assignments_touch_rooming ON public.room_assignments;
CREATE TRIGGER room_assignments_touch_rooming
  AFTER INSERT OR UPDATE OR DELETE ON public.room_assignments
  FOR EACH ROW EXECUTE FUNCTION public.lp_touch_rooming_updated_at();

-- Seed existing tours with the best stamp history allows (the latest hotel /
-- room edit or assignment creation), so the page doesn't say "—" until the
-- next change. Guarded: only fills tours that have no stamp yet.
UPDATE public.tours t
   SET rooming_updated_at = s.latest
  FROM (
    SELECT h.tour_id, GREATEST(MAX(h.updated_at), MAX(r.updated_at), MAX(ra.created_at)) AS latest
      FROM public.hotels h
      LEFT JOIN public.rooms r ON r.hotel_id = h.id
      LEFT JOIN public.room_assignments ra ON ra.room_id = r.id
     GROUP BY h.tour_id
  ) s
 WHERE s.tour_id = t.id
   AND t.rooming_updated_at IS NULL
   AND s.latest IS NOT NULL;

-- ============================================
-- DOWN (run by hand only if rolling back)
-- ============================================
-- DROP TRIGGER IF EXISTS room_assignments_touch_rooming ON public.room_assignments;
-- DROP TRIGGER IF EXISTS rooms_touch_rooming ON public.rooms;
-- DROP TRIGGER IF EXISTS hotels_touch_rooming ON public.hotels;
-- DROP FUNCTION IF EXISTS public.lp_touch_rooming_updated_at();
-- ALTER TABLE public.tours DROP COLUMN IF EXISTS rooming_updated_at;
