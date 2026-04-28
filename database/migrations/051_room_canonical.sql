-- ============================================
-- LOWPASS — Room as canonical entity
-- Migration 051
-- ============================================

CREATE TABLE IF NOT EXISTS public.hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  country text,
  phone text,
  confirmation_number text,
  check_in_at timestamptz,
  check_out_at timestamptz,
  show_id uuid REFERENCES public.routing(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_number text,
  room_type text,
  cost_amount numeric(12,2),
  cost_currency text DEFAULT 'GBP',
  bed_count int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, person_id, starts_on)
);

CREATE INDEX IF NOT EXISTS hotels_workspace_id_idx ON public.hotels(workspace_id);
CREATE INDEX IF NOT EXISTS hotels_tour_id_idx ON public.hotels(tour_id);
CREATE INDEX IF NOT EXISTS rooms_hotel_id_idx ON public.rooms(hotel_id);
CREATE INDEX IF NOT EXISTS room_assignments_room_id_idx ON public.room_assignments(room_id);
CREATE INDEX IF NOT EXISTS room_assignments_person_id_idx ON public.room_assignments(person_id);

ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotels_select ON public.hotels;
CREATE POLICY hotels_select ON public.hotels
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS hotels_insert ON public.hotels;
CREATE POLICY hotels_insert ON public.hotels
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS hotels_update ON public.hotels;
CREATE POLICY hotels_update ON public.hotels
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS hotels_delete ON public.hotels;
CREATE POLICY hotels_delete ON public.hotels
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

DROP POLICY IF EXISTS rooms_select ON public.rooms;
CREATE POLICY rooms_select ON public.rooms
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS rooms_insert ON public.rooms;
CREATE POLICY rooms_insert ON public.rooms
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS rooms_update ON public.rooms;
CREATE POLICY rooms_update ON public.rooms
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS rooms_delete ON public.rooms;
CREATE POLICY rooms_delete ON public.rooms
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

DROP POLICY IF EXISTS room_assignments_select ON public.room_assignments;
CREATE POLICY room_assignments_select ON public.room_assignments
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS room_assignments_insert ON public.room_assignments;
CREATE POLICY room_assignments_insert ON public.room_assignments
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS room_assignments_update ON public.room_assignments;
CREATE POLICY room_assignments_update ON public.room_assignments
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS room_assignments_delete ON public.room_assignments;
CREATE POLICY room_assignments_delete ON public.room_assignments
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

DROP TRIGGER IF EXISTS hotels_updated_at ON public.hotels;
CREATE TRIGGER hotels_updated_at
  BEFORE UPDATE ON public.hotels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS rooms_updated_at ON public.rooms;
CREATE TRIGGER rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS hotel_id uuid REFERENCES public.hotels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS budget_line_items_hotel_id_idx ON public.budget_line_items(hotel_id);
CREATE INDEX IF NOT EXISTS budget_line_items_room_id_idx ON public.budget_line_items(room_id);

-- Backfill hotels from legacy hotel_bookings (id-preserving)
INSERT INTO public.hotels (
  id,
  workspace_id,
  tour_id,
  name,
  address,
  city,
  phone,
  confirmation_number,
  check_in_at,
  check_out_at,
  notes,
  created_at,
  updated_at
)
SELECT
  hb.id,
  hb.workspace_id,
  hb.tour_id,
  COALESCE(NULLIF(hb.hotel_name, ''), 'Hotel'),
  hb.address,
  hb.city,
  hb.phone,
  NULL,
  CASE WHEN hb.check_in_date IS NULL THEN NULL ELSE (hb.check_in_date::timestamp AT TIME ZONE 'UTC') END,
  CASE WHEN hb.check_out_date IS NULL THEN NULL ELSE (hb.check_out_date::timestamp AT TIME ZONE 'UTC') END,
  hb.cancellation_policy,
  hb.created_at,
  hb.updated_at
FROM public.hotel_bookings hb
ON CONFLICT (id) DO NOTHING;

-- Backfill rooms (one per legacy hotel_room_assignments row)
INSERT INTO public.rooms (
  id,
  workspace_id,
  hotel_id,
  room_number,
  room_type,
  cost_amount,
  cost_currency,
  notes,
  created_at,
  updated_at
)
SELECT
  hra.id,
  hra.workspace_id,
  hra.hotel_booking_id,
  hra.room_number,
  hra.room_type,
  COALESCE(hra.rate_per_night, 0),
  'GBP',
  hra.notes,
  hra.created_at,
  COALESCE(hb.updated_at, now())
FROM public.hotel_room_assignments hra
JOIN public.hotel_bookings hb ON hb.id = hra.hotel_booking_id
ON CONFLICT (id) DO NOTHING;

-- Backfill room assignments by matching legacy person_name to canonical persons
INSERT INTO public.room_assignments (
  workspace_id,
  room_id,
  person_id,
  starts_on,
  ends_on,
  created_at
)
SELECT
  hra.workspace_id,
  hra.id AS room_id,
  p.id AS person_id,
  COALESCE(hra.check_in, hb.check_in_date, CURRENT_DATE),
  COALESCE(hra.check_out, hb.check_out_date, COALESCE(hra.check_in, hb.check_in_date, CURRENT_DATE)),
  hra.created_at
FROM public.hotel_room_assignments hra
JOIN public.hotel_bookings hb ON hb.id = hra.hotel_booking_id
JOIN public.persons p
  ON p.workspace_id = hra.workspace_id
 AND lower(trim(p.full_name)) = lower(trim(COALESCE(hra.person_name, '')))
ON CONFLICT (room_id, person_id, starts_on) DO NOTHING;

-- Link legacy budget rows where available
UPDATE public.budget_line_items bli
SET
  hotel_id = hb.id,
  source_entity_type = 'hotel_booking',
  source_entity_id = hb.id
FROM public.hotel_bookings hb
WHERE hb.line_item_id = bli.id
  AND bli.hotel_id IS NULL;

-- DOWN
-- DROP INDEX IF EXISTS budget_line_items_room_id_idx;
-- DROP INDEX IF EXISTS budget_line_items_hotel_id_idx;
-- ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS room_id;
-- ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS hotel_id;
-- DROP TRIGGER IF EXISTS rooms_updated_at ON public.rooms;
-- DROP TRIGGER IF EXISTS hotels_updated_at ON public.hotels;
-- DROP POLICY IF EXISTS room_assignments_delete ON public.room_assignments;
-- DROP POLICY IF EXISTS room_assignments_update ON public.room_assignments;
-- DROP POLICY IF EXISTS room_assignments_insert ON public.room_assignments;
-- DROP POLICY IF EXISTS room_assignments_select ON public.room_assignments;
-- DROP POLICY IF EXISTS rooms_delete ON public.rooms;
-- DROP POLICY IF EXISTS rooms_update ON public.rooms;
-- DROP POLICY IF EXISTS rooms_insert ON public.rooms;
-- DROP POLICY IF EXISTS rooms_select ON public.rooms;
-- DROP POLICY IF EXISTS hotels_delete ON public.hotels;
-- DROP POLICY IF EXISTS hotels_update ON public.hotels;
-- DROP POLICY IF EXISTS hotels_insert ON public.hotels;
-- DROP POLICY IF EXISTS hotels_select ON public.hotels;
-- DROP TABLE IF EXISTS public.room_assignments;
-- DROP TABLE IF EXISTS public.rooms;
-- DROP TABLE IF EXISTS public.hotels;
