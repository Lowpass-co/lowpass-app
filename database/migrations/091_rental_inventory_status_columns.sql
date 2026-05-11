/* ============================================
   Migration 091 — rental_inventory grid columns (Sprint 11 §5)

   Adds the three columns the equipment grid rework needs to
   render filter chips + status pills + last-used metadata:

     - category      : TEXT (idempotent — already exists in
                       most workspaces but the rental_inventory
                       table is one of the historical
                       direct-pasted tables noted in CLAUDE.md
                       with no canonical CREATE TABLE migration,
                       so we explicitly reconcile here).
     - status        : TEXT NOT NULL DEFAULT 'available' with a
                       CHECK constraint covering the four
                       lifecycle states the grid renders as
                       pills: available, in_use, maintenance,
                       retired.
     - last_used_at  : TIMESTAMPTZ — stamped each time the item
                       lands on a confirmed rental_jobs row.
                       Drives the "Last used" relative time
                       shown on each grid row. Backfill uses
                       the latest confirmed job's start_date
                       when present, else NULL.

   Apply via: npm run db:migrate
   ============================================ */

ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'available';

/* The CHECK constraint is added separately (and idempotently)
   so re-running the migration on a workspace that already has
   the column doesn't error on a duplicate constraint. The
   DO block lets us check pg_constraint before adding. */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rental_inventory_status_check'
      AND conrelid = 'public.rental_inventory'::regclass
  ) THEN
    ALTER TABLE public.rental_inventory
      ADD CONSTRAINT rental_inventory_status_check
      CHECK (status IN ('available', 'in_use', 'maintenance', 'retired'));
  END IF;
END $$;

ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

/* Backfill last_used_at from the most-recent confirmed /
   invoiced / completed job that references each inventory row.
   Idempotent — re-runs only update rows whose computed value
   changed. Dropdown of valid statuses kept inline with the
   rental_jobs.status enum check. */
UPDATE public.rental_inventory inv
SET last_used_at = sub.last_use
FROM (
  SELECT rji.inventory_id, MAX(
    COALESCE(
      to_timestamp(rj.start_date::text, 'YYYY-MM-DD'),
      rj.created_at
    )
  ) AS last_use
  FROM public.rental_job_items rji
  INNER JOIN public.rental_jobs rj ON rj.id = rji.job_id
  WHERE rj.status IN ('confirmed', 'invoiced', 'completed')
  GROUP BY rji.inventory_id
) AS sub
WHERE inv.id = sub.inventory_id
  AND (inv.last_used_at IS DISTINCT FROM sub.last_use);

/* Partial index for the grid's "in_use" + "needs maintenance"
   filters — keeps the per-status scan cheap as the inventory
   grows. */
CREATE INDEX IF NOT EXISTS rental_inventory_status_active_idx
  ON public.rental_inventory (status)
  WHERE status IN ('in_use', 'maintenance');

CREATE INDEX IF NOT EXISTS rental_inventory_last_used_at_idx
  ON public.rental_inventory (last_used_at DESC NULLS LAST);

/* ============================================
   Down migration
   ============================================ */
-- DROP INDEX IF EXISTS rental_inventory_last_used_at_idx;
-- DROP INDEX IF EXISTS rental_inventory_status_active_idx;
-- ALTER TABLE public.rental_inventory DROP COLUMN IF EXISTS last_used_at;
-- ALTER TABLE public.rental_inventory DROP CONSTRAINT IF EXISTS rental_inventory_status_check;
-- ALTER TABLE public.rental_inventory DROP COLUMN IF EXISTS status;
-- (category column intentionally NOT dropped on rollback — predates this migration.)
