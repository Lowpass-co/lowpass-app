-- ============================================
-- LOWPASS — Rental inventory ↔ Gear canonical bridge
-- Migration 057
--
-- Adds the bridge between the standalone Rental Business module
-- (rental_inventory + rental_jobs + rental_job_items + branded PDF export)
-- and the canonical Gear entity introduced in UX12. **Both tables stay
-- intact.** This is a linking exercise — no schema collapses.
--
-- Per UX21:
--   - rental_jobs.tour_id was added in earlier rental setup (visible in
--     src/components/equipment/types.ts), so this migration only adds the
--     gear → rental_inventory FK and its index.
--   - No automatic backfill — operators link items by hand via the new UI
--     in src/components/entity/gear/GearSlideOver.tsx and the Inventory
--     tab "Add to tour" affordance.
-- ============================================

-- Link a canonical Gear record to its underlying rental_inventory row, if any.
ALTER TABLE public.gear
  ADD COLUMN IF NOT EXISTS rental_inventory_id uuid
    REFERENCES public.rental_inventory(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gear_rental_inventory_id_idx
  ON public.gear(rental_inventory_id);

-- Defensive: ensure rental_jobs.tour_id exists. Older rental setups may not
-- have it. If it's already present this is a no-op.
ALTER TABLE public.rental_jobs
  ADD COLUMN IF NOT EXISTS tour_id uuid
    REFERENCES public.tours(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rental_jobs_tour_id_idx
  ON public.rental_jobs(tour_id);

-- ============================================
-- Down migration (commented out; use as reference if rolling back)
-- ============================================
-- DROP INDEX IF EXISTS public.rental_jobs_tour_id_idx;
-- DROP INDEX IF EXISTS public.gear_rental_inventory_id_idx;
-- ALTER TABLE public.gear DROP COLUMN IF EXISTS rental_inventory_id;
-- -- Do NOT drop rental_jobs.tour_id; it predates this migration in many
-- -- environments and dropping it would break the rental UI.
