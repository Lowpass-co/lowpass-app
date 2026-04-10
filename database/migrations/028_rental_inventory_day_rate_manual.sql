-- ============================================
-- LOWPASS — rental_inventory.day_rate_manual
--
-- Equipment UI uses this flag (auto day rate = 1% of purchase vs manual).
-- If missing, Supabase returns: column not found in schema cache.
-- Idempotent: safe to re-run.
-- ============================================

ALTER TABLE rental_inventory ADD COLUMN IF NOT EXISTS day_rate_manual BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark rows where day_rate clearly differs from 1% of purchase as manual
UPDATE rental_inventory
SET day_rate_manual = TRUE
WHERE purchase_cost IS NOT NULL AND purchase_cost > 0
  AND day_rate IS NOT NULL
  AND ABS(day_rate - ROUND((purchase_cost * 0.01)::numeric, 2)) > 0.02;

-- Backfill auto day rate where still automatic
UPDATE rental_inventory
SET day_rate = ROUND((purchase_cost * 0.01)::numeric, 2)
WHERE day_rate_manual = FALSE
  AND purchase_cost IS NOT NULL AND purchase_cost > 0;
