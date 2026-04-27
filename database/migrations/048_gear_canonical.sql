-- ============================================
-- LOWPASS — Gear as canonical entity (UX12)
-- Migration 048
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gear_ownership') THEN
    CREATE TYPE public.gear_ownership AS ENUM ('owned', 'sub_hired', 'hired_to_client');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.gear (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  manufacturer text,
  model text,
  serial_number text,
  ownership public.gear_ownership NOT NULL DEFAULT 'owned',
  owner_label text,
  hire_cost_amount numeric(12,2),
  hire_cost_currency text DEFAULT 'GBP',
  hire_cost_period text,
  notes text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tour_gear (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL REFERENCES public.gear(id) ON DELETE CASCADE,
  tour_ownership public.gear_ownership,
  tour_hire_cost_amount numeric(12,2),
  tour_hire_cost_currency text,
  tour_hire_cost_period text,
  starts_on date,
  ends_on date,
  quantity int DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tour_id, gear_id)
);

CREATE INDEX IF NOT EXISTS gear_workspace_idx ON public.gear(workspace_id);
CREATE INDEX IF NOT EXISTS gear_name_idx ON public.gear(name);
CREATE INDEX IF NOT EXISTS tour_gear_tour_idx ON public.tour_gear(tour_id);
CREATE INDEX IF NOT EXISTS tour_gear_gear_idx ON public.tour_gear(gear_id);

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS gear_id uuid REFERENCES public.gear(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tour_gear_id uuid REFERENCES public.tour_gear(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS budget_line_items_gear_id_idx ON public.budget_line_items(gear_id);
CREATE INDEX IF NOT EXISTS budget_line_items_tour_gear_id_idx ON public.budget_line_items(tour_gear_id);

ALTER TABLE public.channel_list_rows
  ADD COLUMN IF NOT EXISTS gear_id uuid REFERENCES public.gear(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS channel_list_rows_gear_id_idx ON public.channel_list_rows(gear_id);

ALTER TABLE public.gear ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_gear ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gear_select ON public.gear;
CREATE POLICY gear_select ON public.gear
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS gear_insert ON public.gear;
CREATE POLICY gear_insert ON public.gear
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS gear_update ON public.gear;
CREATE POLICY gear_update ON public.gear
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS gear_delete ON public.gear;
CREATE POLICY gear_delete ON public.gear
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

DROP POLICY IF EXISTS tour_gear_select ON public.tour_gear;
CREATE POLICY tour_gear_select ON public.tour_gear
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS tour_gear_insert ON public.tour_gear;
CREATE POLICY tour_gear_insert ON public.tour_gear
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS tour_gear_update ON public.tour_gear;
CREATE POLICY tour_gear_update ON public.tour_gear
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS tour_gear_delete ON public.tour_gear;
CREATE POLICY tour_gear_delete ON public.tour_gear
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

DROP TRIGGER IF EXISTS gear_updated_at ON public.gear;
CREATE TRIGGER gear_updated_at
  BEFORE UPDATE ON public.gear
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill mic library into canonical gear.
INSERT INTO public.gear (
  workspace_id,
  name,
  category,
  ownership,
  notes
)
SELECT
  ml.workspace_id,
  ml.name,
  'mic',
  'owned'::public.gear_ownership,
  CASE WHEN ml.type IS NOT NULL THEN 'Mic type: ' || ml.type ELSE NULL END
FROM public.mic_library ml
WHERE ml.workspace_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill channel_list_rows.gear_id from mic text where name is unambiguous.
WITH matches AS (
  SELECT
    clr.id AS row_id,
    MIN(g.id) AS gear_id,
    COUNT(*) AS match_count
  FROM public.channel_list_rows clr
  JOIN public.rider_packs rp ON rp.id = clr.pack_id
  JOIN public.gear g
    ON g.workspace_id = rp.workspace_id
   AND lower(trim(g.name)) = lower(trim(clr.mic))
  WHERE clr.mic IS NOT NULL
    AND trim(clr.mic) <> ''
    AND clr.gear_id IS NULL
  GROUP BY clr.id
)
UPDATE public.channel_list_rows clr
SET gear_id = m.gear_id
FROM matches m
WHERE clr.id = m.row_id
  AND m.match_count = 1;

-- DOWN
-- DROP INDEX IF EXISTS channel_list_rows_gear_id_idx;
-- ALTER TABLE public.channel_list_rows DROP COLUMN IF EXISTS gear_id;
-- DROP INDEX IF EXISTS budget_line_items_tour_gear_id_idx;
-- DROP INDEX IF EXISTS budget_line_items_gear_id_idx;
-- ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS tour_gear_id;
-- ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS gear_id;
-- DROP TRIGGER IF EXISTS gear_updated_at ON public.gear;
-- DROP POLICY IF EXISTS tour_gear_delete ON public.tour_gear;
-- DROP POLICY IF EXISTS tour_gear_update ON public.tour_gear;
-- DROP POLICY IF EXISTS tour_gear_insert ON public.tour_gear;
-- DROP POLICY IF EXISTS tour_gear_select ON public.tour_gear;
-- DROP POLICY IF EXISTS gear_delete ON public.gear;
-- DROP POLICY IF EXISTS gear_update ON public.gear;
-- DROP POLICY IF EXISTS gear_insert ON public.gear;
-- DROP POLICY IF EXISTS gear_select ON public.gear;
-- DROP TABLE IF EXISTS public.tour_gear;
-- DROP TABLE IF EXISTS public.gear;
-- DROP TYPE IF EXISTS public.gear_ownership;
