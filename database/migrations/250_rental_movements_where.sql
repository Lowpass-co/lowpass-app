-- ============================================================================
-- 250_rental_movements_where.sql
--
-- S1 Stage B (5/5) — give the scan log its missing "where". rental_movements
-- (mig 094) records who/when/type but has NO location column, though its own
-- header promised one. Add from/to space + container, and gear_id so movements
-- reference the unified item (backfilled from the provenance chain).
--
-- The scan flow itself (/rental/scan → move dialog) is built fresh in Stage D;
-- this migration only lands the columns it will write.
--
-- HAND-APPLIED. Idempotent (ADD COLUMN IF NOT EXISTS + guarded UPDATE). Depends
-- on 246 (spaces/containers) + 248 (gear rows).
-- ============================================================================

BEGIN;

ALTER TABLE public.rental_movements
  ADD COLUMN IF NOT EXISTS from_space_id     UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_space_id       UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS from_container_id UUID REFERENCES public.containers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_container_id   UUID REFERENCES public.containers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gear_id           UUID REFERENCES public.gear(id) ON DELETE CASCADE;

-- Point existing movements at the unified item (rental_inventory_id → gear).
UPDATE public.rental_movements rm
SET gear_id = g.id
FROM public.gear g
WHERE g.rental_inventory_id = rm.rental_inventory_id
  AND rm.gear_id IS NULL;

CREATE INDEX IF NOT EXISTS rental_movements_gear_idx ON public.rental_movements(gear_id);

COMMIT;

-- ============================================================================
-- DOWN (manual — paste to reverse):
-- BEGIN;
-- DROP INDEX IF EXISTS public.rental_movements_gear_idx;
-- ALTER TABLE public.rental_movements
--   DROP COLUMN IF EXISTS gear_id,
--   DROP COLUMN IF EXISTS to_container_id, DROP COLUMN IF EXISTS from_container_id,
--   DROP COLUMN IF EXISTS to_space_id, DROP COLUMN IF EXISTS from_space_id;
-- COMMIT;
-- ============================================================================
