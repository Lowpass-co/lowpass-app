/* ============================================
   Migration 101 — tour_personnel.role_tag (Sprint 12 §9c.0)

   Adds a structured role discriminator to tour_personnel so
   the rider variable resolver ({contact.tm.*}, {contact.foh.*},
   etc.) can filter on a known set of values. The existing
   freeform `role text` column stays — that's what renders in
   the rider's Key Contacts table. role_tag is purely the
   filter target.

   Allowed values (9):
     tm           Tour Manager
     tm2          Assistant Tour Manager
     pm           Production Manager
     foh          Front of House Engineer
     mons         Monitors Engineer
     ld           Lighting Designer
     backline     Backline Tech
     management   Artist management
     other        Catch-all (the default — existing rows
                  backfill here, operators tag forward as
                  they revisit each tour)

   Idempotent. Re-running is a no-op.

   Apply via: npm run db:migrate (or manual paste).
   ============================================ */

ALTER TABLE public.tour_personnel
  ADD COLUMN IF NOT EXISTS role_tag TEXT NOT NULL DEFAULT 'other';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tour_personnel_role_tag_check'
      AND conrelid = 'public.tour_personnel'::regclass
  ) THEN
    ALTER TABLE public.tour_personnel
      ADD CONSTRAINT tour_personnel_role_tag_check
      CHECK (role_tag IN (
        'tm', 'tm2', 'pm', 'foh', 'mons',
        'ld', 'backline', 'management', 'other'
      ));
  END IF;
END $$;

/* Partial index keyed for the variable resolver's per-tour
   lookup. The resolver runs WHERE tour_id = $tour AND
   role_tag = '<tag>'; the index covers both. The 'other'
   catch-all is filtered out because the resolver never
   queries it (there's no {contact.other.*} variable). */
CREATE INDEX IF NOT EXISTS tour_personnel_tour_role_tag_idx
  ON public.tour_personnel (tour_id, role_tag)
  WHERE role_tag <> 'other';

/* ============================================
   Down migration
   ============================================ */
-- DROP INDEX IF EXISTS public.tour_personnel_tour_role_tag_idx;
-- ALTER TABLE public.tour_personnel
--   DROP CONSTRAINT IF EXISTS tour_personnel_role_tag_check;
-- ALTER TABLE public.tour_personnel DROP COLUMN IF EXISTS role_tag;
