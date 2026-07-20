-- ============================================================================
-- 248_gear_backfill_from_rental.sql
--
-- S1 Stage B (3/5) — populate the unified `gear` from `rental_inventory`.
--
--   LINKED   (gear.rental_inventory_id IS NOT NULL = "same physical item"):
--            merge the physical/carnet columns onto the existing gear row,
--            FILL-ONLY-WHERE-NULL — never clobber a value the operator set on
--            gear (Adam's rule). Rate map is fill-only too (day_rate →
--            hire_cost_amount, period 'day').
--   UNLINKED (rental_inventory rows no gear points at): INSERT as a NEW gear
--            row, ownership='owned', day_rate → hire_cost_amount period 'day',
--            stamping rental_inventory_id = the source id as PROVENANCE (also
--            makes the insert idempotent — WHERE NOT EXISTS guards a re-paste).
--
-- `status` and `dimensions_cm` are adopted from rental where gear has only the
-- just-added column DEFAULT (gear never tracked either before), so this is
-- additive, not a clobber.
--
-- HAND-APPLIED. Idempotent (guarded UPDATE + WHERE NOT EXISTS insert). Depends
-- on 247 (the columns must exist). Re-running is a safe no-op.
-- ============================================================================

BEGIN;

-- 1. LINKED — merge onto the existing gear row, fill-only-where-NULL. ---------
-- The WHERE guard limits the UPDATE to rows that still have a fillable gap, so a
-- double-paste after the gaps are filled matches ZERO rows — a true no-op (no
-- updated_at churn).
UPDATE public.gear g SET
  country_of_origin = COALESCE(g.country_of_origin, ri.country_of_origin),
  customs_hs_code   = COALESCE(g.customs_hs_code,   ri.customs_hs_code),
  purchase_cost     = COALESCE(g.purchase_cost,     ri.purchase_cost),
  day_rate          = COALESCE(g.day_rate,          ri.day_rate),
  weight_kg         = COALESCE(g.weight_kg,         ri.weight_kg),
  value_amount      = COALESCE(g.value_amount,      ri.value_amount),
  value_currency    = COALESCE(g.value_currency,    ri.value_currency),
  qr_token          = COALESCE(g.qr_token,          ri.qr_token),
  last_used_at      = COALESCE(g.last_used_at,      ri.last_used_at),
  -- rate mapping (fill-only): gear.hire_cost_amount stays if already set.
  hire_cost_amount  = COALESCE(g.hire_cost_amount,  ri.day_rate),
  -- ...and give the merged amount a unit: when hire_cost_amount is filled from
  -- day_rate, set the period to 'day' (never clobber an existing period).
  hire_cost_period  = CASE WHEN g.hire_cost_amount IS NULL AND ri.day_rate IS NOT NULL THEN COALESCE(g.hire_cost_period,'day') ELSE g.hire_cost_period END,
  -- dimensions / status: adopt from rental where gear still holds the default.
  dimensions_cm     = CASE WHEN g.dimensions_cm = '{}'::jsonb THEN COALESCE(ri.dimensions_cm, '{}'::jsonb) ELSE g.dimensions_cm END,
  status            = CASE WHEN g.status = 'available' AND ri.status IN ('available','in_use','maintenance','retired') THEN ri.status ELSE g.status END,
  updated_at        = now()
FROM public.rental_inventory ri
WHERE g.rental_inventory_id = ri.id
  AND (
       (g.hire_cost_amount  IS NULL AND ri.day_rate          IS NOT NULL)
    OR (g.hire_cost_period  IS NULL AND ri.day_rate          IS NOT NULL)
    OR (g.country_of_origin IS NULL AND ri.country_of_origin IS NOT NULL)
    OR (g.customs_hs_code   IS NULL AND ri.customs_hs_code   IS NOT NULL)
    OR (g.purchase_cost     IS NULL AND ri.purchase_cost     IS NOT NULL)
    OR (g.day_rate          IS NULL AND ri.day_rate          IS NOT NULL)
    OR (g.weight_kg         IS NULL AND ri.weight_kg         IS NOT NULL)
    OR (g.value_amount      IS NULL AND ri.value_amount      IS NOT NULL)
    OR (g.qr_token          IS NULL AND ri.qr_token          IS NOT NULL)
    OR (g.last_used_at      IS NULL AND ri.last_used_at      IS NOT NULL)
    OR (g.dimensions_cm = '{}'::jsonb AND ri.dimensions_cm IS NOT NULL AND ri.dimensions_cm <> '{}'::jsonb)
    OR (g.status = 'available' AND ri.status IN ('in_use','maintenance','retired'))
  );

-- 2. UNLINKED — insert as new gear (idempotent via NOT EXISTS). ---------------
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
WHERE NOT EXISTS (SELECT 1 FROM public.gear g WHERE g.rental_inventory_id = ri.id);

COMMIT;

-- ============================================================================
-- DOWN (manual — NO safe automated reverse):
-- The inserted rows are NOT distinguishable from pre-existing operator-linked
-- gear (both have rental_inventory_id set), so a blanket delete would destroy
-- real gear. The merged columns on linked rows are harmless additive data —
-- leave them. To reverse the INSERTs only, first identify them (e.g. rows with
-- no tour_gear AND created_at >= the paste time you recorded), verify by hand,
-- then delete that explicit id list. Do not auto-run a delete here.
-- ============================================================================
