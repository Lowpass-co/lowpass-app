-- ============================================================================
-- 306_rental_phase1.sql
--
-- Rental revamp, Phase 1 (Nov 2026, Adam: "make the rental house feature more
-- professional, and reliable"). Lays the floor the job builder needs:
--
--   1. ONE STOCK LIST. The job builder picked from rental_inventory while the
--      Gear & rentals page (Assets) writes only `gear` — so anything added
--      since the S1 move could never go on a job. The job builder now reads
--      `gear` and job lines point at gear_id. This re-runs the two S1 steps it
--      depends on (248's copy of rental_inventory → gear, 249's
--      rental_job_items.gear_id) so it is correct whether or not those were
--      pasted, and relaxes rental_job_items.inventory_id (NOT NULL → NULL) so a
--      line for an item that only exists in `gear` can be saved.
--   2. QUANTITY. gear.quantity — how many of this item you own (1 for a
--      console, 40 for XLR 10 m). Job lines already carry their own quantity.
--   3. WEEK PRICING. A week is charged as N days (default 3, Adam: "should be 3
--      day week, but customisable"): workspaces.rental_days_per_week is the
--      default, rental_jobs.days_per_week overrides it per job (NULL = use the
--      default).
--
-- HAND-APPLIED. Idempotent / re-runnable: ADD COLUMN IF NOT EXISTS, guarded
-- INSERT / UPDATE, constraints added only when missing. Down-block at the end.
-- Ends with a read-only report.
-- ============================================================================

BEGIN;

-- ── 1a. Every rental_inventory row has its gear row (248, unlinked part) ────
INSERT INTO public.gear (
  workspace_id, name, category, serial_number, image_url, notes,
  ownership, hire_cost_amount, hire_cost_currency, hire_cost_period,
  country_of_origin, customs_hs_code, purchase_cost, day_rate, day_rate_manual,
  weight_kg, value_amount, value_currency, dimensions_cm, qr_token, status, last_used_at,
  rental_inventory_id
)
SELECT
  ri.workspace_id, ri.name, ri.category, ri.serial_number, ri.image_url, ri.notes,
  'owned', ri.day_rate, 'GBP', 'day',
  ri.country_of_origin, ri.customs_hs_code, ri.purchase_cost, ri.day_rate, COALESCE(ri.day_rate_manual, FALSE),
  ri.weight_kg, ri.value_amount, COALESCE(ri.value_currency, 'GBP'), COALESCE(ri.dimensions_cm, '{}'::jsonb),
  ri.qr_token, COALESCE(ri.status, 'available'), ri.last_used_at,
  ri.id
FROM public.rental_inventory ri
WHERE ri.workspace_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gear g WHERE g.rental_inventory_id = ri.id);

-- ── 1b. Job lines point at gear (249) ───────────────────────────────────────
ALTER TABLE public.rental_job_items
  ADD COLUMN IF NOT EXISTS gear_id UUID REFERENCES public.gear(id) ON DELETE RESTRICT;

UPDATE public.rental_job_items rji
SET gear_id = g.id
FROM public.gear g
WHERE g.rental_inventory_id = rji.inventory_id
  AND rji.gear_id IS NULL;

CREATE INDEX IF NOT EXISTS rental_job_items_gear_idx ON public.rental_job_items(gear_id);

-- A line for an item that only exists in gear has no rental_inventory row.
ALTER TABLE public.rental_job_items ALTER COLUMN inventory_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_job_items_has_item') THEN
    ALTER TABLE public.rental_job_items
      ADD CONSTRAINT rental_job_items_has_item CHECK (gear_id IS NOT NULL OR inventory_id IS NOT NULL);
  END IF;
END $$;

-- ── 2. How many you own ─────────────────────────────────────────────────────
ALTER TABLE public.gear
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gear_quantity_positive') THEN
    ALTER TABLE public.gear ADD CONSTRAINT gear_quantity_positive CHECK (quantity >= 1);
  END IF;
END $$;

-- ── 3. Week pricing ─────────────────────────────────────────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS rental_days_per_week NUMERIC(3,1) NOT NULL DEFAULT 3;
ALTER TABLE public.rental_jobs
  ADD COLUMN IF NOT EXISTS days_per_week NUMERIC(3,1);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_rental_days_per_week_range') THEN
    ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_rental_days_per_week_range
      CHECK (rental_days_per_week >= 1 AND rental_days_per_week <= 7);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_jobs_days_per_week_range') THEN
    ALTER TABLE public.rental_jobs ADD CONSTRAINT rental_jobs_days_per_week_range
      CHECK (days_per_week IS NULL OR (days_per_week >= 1 AND days_per_week <= 7));
  END IF;
END $$;

COMMIT;

-- ── Report (read-only): all four should be 0 ───────────────────────────────
SELECT
  (SELECT count(*) FROM public.rental_inventory ri
     WHERE ri.workspace_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.gear g WHERE g.rental_inventory_id = ri.id))   AS stock_not_in_gear,
  (SELECT count(*) FROM public.rental_job_items WHERE gear_id IS NULL)                    AS job_lines_without_gear,
  (SELECT count(*) FROM public.rental_inventory WHERE workspace_id IS NULL)               AS stock_with_no_workspace,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'rental_job_items' AND column_name = 'inventory_id' AND is_nullable = 'NO') AS inventory_id_still_required;

/* ============================================================================
   DOWN (manual — only if nothing has been saved against gear-only items):
   ALTER TABLE public.rental_jobs DROP CONSTRAINT IF EXISTS rental_jobs_days_per_week_range;
   ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_rental_days_per_week_range;
   ALTER TABLE public.rental_jobs DROP COLUMN IF EXISTS days_per_week;
   ALTER TABLE public.workspaces DROP COLUMN IF EXISTS rental_days_per_week;
   ALTER TABLE public.gear DROP CONSTRAINT IF EXISTS gear_quantity_positive;
   ALTER TABLE public.gear DROP COLUMN IF EXISTS quantity;
   ALTER TABLE public.rental_job_items DROP CONSTRAINT IF EXISTS rental_job_items_has_item;
   -- inventory_id NOT NULL can only come back if every line has one.
   ============================================================================ */
