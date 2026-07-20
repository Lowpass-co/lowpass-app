-- ============================================================================
-- 249_rental_job_items_gear_id.sql
--
-- S1 Stage B (4/5) — re-point rental job lines at the unified gear item.
--
-- rental_job_items.inventory_id is ON DELETE RESTRICT → rental_inventory, which
-- is exactly why the shadow table can't be dropped yet. This adds gear_id and
-- backfills it from the provenance chain (rental_inventory_id → gear, which is
-- now total after migration 248: every rental row has a gear row). The OLD
-- inventory_id FK is LEFT IN PLACE — rollback insurance — and retired only in a
-- later migration once Stage C's cutover is verified in production.
--
-- After Stage C, the Jobs item-picker writes gear_id (not inventory_id); until
-- the old FK is dropped, both point at the same physical item.
--
-- HAND-APPLIED. Idempotent (ADD COLUMN IF NOT EXISTS + guarded UPDATE). Depends
-- on 248 (gear rows must exist for every rental item).
-- ============================================================================

BEGIN;

ALTER TABLE public.rental_job_items
  ADD COLUMN IF NOT EXISTS gear_id UUID REFERENCES public.gear(id) ON DELETE RESTRICT;

-- Backfill from the provenance link. After 248 every rental_inventory row has
-- exactly one gear row (linked-merge or unlinked-insert), so this is total.
UPDATE public.rental_job_items rji
SET gear_id = g.id
FROM public.gear g
WHERE g.rental_inventory_id = rji.inventory_id
  AND rji.gear_id IS NULL;

CREATE INDEX IF NOT EXISTS rental_job_items_gear_idx ON public.rental_job_items(gear_id);

COMMIT;

-- Post-paste sanity (run manually — expect 0): rows the backfill couldn't map.
--   SELECT count(*) FROM public.rental_job_items WHERE gear_id IS NULL;

-- ============================================================================
-- DOWN (manual — paste to reverse):
-- BEGIN;
-- DROP INDEX IF EXISTS public.rental_job_items_gear_idx;
-- ALTER TABLE public.rental_job_items DROP COLUMN IF EXISTS gear_id;
-- COMMIT;
-- ============================================================================
