-- ============================================
-- LOWPASS — Flight as canonical entity
-- Migration 049
-- ============================================

CREATE TABLE IF NOT EXISTS public.flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,

  -- Canonical flight details
  airline text,
  flight_number text,
  pnr text,
  origin_airport text NOT NULL,
  destination_airport text NOT NULL,
  depart_at timestamptz NOT NULL,
  arrive_at timestamptz NOT NULL,
  cost_amount numeric(12,2),
  cost_currency text NOT NULL DEFAULT 'GBP',
  passenger_ids uuid[] NOT NULL DEFAULT '{}',
  notes text,
  show_id uuid REFERENCES public.routing(id) ON DELETE SET NULL,

  -- Compatibility fields used by current UI
  person_name text NOT NULL DEFAULT '',
  role text,
  confirmation text,
  leg_order int NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS flights_workspace_id_idx ON public.flights(workspace_id);
CREATE INDEX IF NOT EXISTS flights_tour_id_idx ON public.flights(tour_id);
CREATE INDEX IF NOT EXISTS flights_show_id_idx ON public.flights(show_id);
CREATE INDEX IF NOT EXISTS flights_depart_at_idx ON public.flights(depart_at);

ALTER TABLE public.flights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flights_select ON public.flights;
CREATE POLICY flights_select ON public.flights
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS flights_insert ON public.flights;
CREATE POLICY flights_insert ON public.flights
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS flights_update ON public.flights;
CREATE POLICY flights_update ON public.flights
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS flights_delete ON public.flights;
CREATE POLICY flights_delete ON public.flights
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

DROP TRIGGER IF EXISTS flights_updated_at ON public.flights;
CREATE TRIGGER flights_updated_at
  BEFORE UPDATE ON public.flights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS flight_id uuid REFERENCES public.flights(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS budget_line_items_flight_id_idx ON public.budget_line_items(flight_id);

ALTER TABLE public.budget_line_items DROP CONSTRAINT IF EXISTS budget_line_items_source_entity_type_check;
ALTER TABLE public.budget_line_items
  ADD CONSTRAINT budget_line_items_source_entity_type_check
  CHECK (
    source_entity_type IS NULL
    OR source_entity_type IN ('hotel_booking', 'flight_booking', 'flight')
  );

-- Backfill legacy flight_bookings -> canonical flights
INSERT INTO public.flights (
  id,
  workspace_id,
  tour_id,
  airline,
  flight_number,
  pnr,
  origin_airport,
  destination_airport,
  depart_at,
  arrive_at,
  cost_amount,
  cost_currency,
  notes,
  person_name,
  role,
  confirmation,
  leg_order,
  created_at,
  updated_at
)
SELECT
  fb.id,
  fb.workspace_id,
  fb.tour_id,
  fb.airline,
  fb.flight_number,
  fb.confirmation,
  COALESCE(NULLIF(fb.origin_code, ''), 'TBD'),
  COALESCE(NULLIF(fb.destination_code, ''), 'TBD'),
  COALESCE(
    (fb.departure_date::timestamp + COALESCE(fb.departure_time, time '00:00')) AT TIME ZONE 'UTC',
    now()
  ),
  COALESCE(
    (fb.departure_date::timestamp + COALESCE(fb.departure_time, time '00:00') + interval '2 hour') AT TIME ZONE 'UTC',
    now() + interval '2 hour'
  ),
  COALESCE(fb.actual_cost, fb.proposed_cost, 0),
  'GBP',
  NULL,
  fb.person_name,
  fb.role,
  fb.confirmation,
  COALESCE(fb.leg_order, 1),
  fb.created_at,
  fb.updated_at
FROM public.flight_bookings fb
ON CONFLICT (id) DO NOTHING;

-- Link existing line items to canonical flights where possible
UPDATE public.budget_line_items bli
SET
  flight_id = fb.id,
  source_entity_type = 'flight',
  source_entity_id = fb.id,
  label = CASE
    WHEN COALESCE(NULLIF(bli.label, ''), '') = '' THEN TRIM(BOTH FROM (COALESCE(f.person_name, '') || ': ' || f.origin_airport || '→' || f.destination_airport))
    ELSE bli.label
  END,
  proposed_cost = COALESCE(f.cost_amount, 0),
  actual_cost = COALESCE(f.cost_amount, 0),
  updated_at = now()
FROM public.flight_bookings fb
JOIN public.flights f ON f.id = fb.id
WHERE bli.id = fb.line_item_id
  AND bli.flight_id IS NULL;

-- DOWN
-- DROP TRIGGER IF EXISTS flights_updated_at ON public.flights;
-- DROP POLICY IF EXISTS flights_delete ON public.flights;
-- DROP POLICY IF EXISTS flights_update ON public.flights;
-- DROP POLICY IF EXISTS flights_insert ON public.flights;
-- DROP POLICY IF EXISTS flights_select ON public.flights;
-- DROP TABLE IF EXISTS public.flights;
-- DROP INDEX IF EXISTS budget_line_items_flight_id_idx;
-- ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS flight_id;
