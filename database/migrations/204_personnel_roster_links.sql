-- ============================================
-- LOWPASS — Personnel unification: tie payroll + rooming to the roster
-- Migration 204 (Personnel unification — Phase 1)
-- ============================================
--
-- Today the three person lists drift because they're independent:
--   - personnel_rates (payroll) is keyed by free-text `person_name` only —
--     no person_id, no roster link.
--   - room_assignments (rooming) references persons(id) but is NOT gated by
--     the tour roster, so off-tour people can hold rooms (the "Duncan" bug).
--   - tour_personnel (the canonical roster → persons) exists but nothing
--     wires payroll/rooming to it.
--
-- This migration makes tour_personnel the single roster every surface
-- derives from: it adds the missing FK columns and LOSSLESSLY backfills a
-- roster row for the UNION of existing payroll people + rooming people,
-- linking their rate cards + room assignments to that roster row.
--
-- ⚠️ BACKFILL CAVEAT — payroll people are matched to canonical `persons`
-- by case/whitespace-insensitive name (personnel_rates.person_name →
-- persons.full_name); unmatched names get a freshly-created person. Name
-- matching is fuzzy by nature (typos, preferred vs legal names). Anyone
-- who can't be cleanly resolved still gets a roster row + keeps their link,
-- and the Phase 2 UI flags "not on roster — add or remove" so it's a
-- one-click clean-up rather than silent data loss. REVIEW + APPLY TO A COPY
-- FIRST and sanity-check the roster before production.
--
-- FK delete semantics (support Phase 3 cascade + shared-room safety):
--   personnel_rates.tour_personnel_id  ON DELETE CASCADE  (drop the rate
--       card when the roster member is removed; payroll_entries already
--       cascade off personnel_rates)
--   room_assignments.tour_personnel_id ON DELETE CASCADE  (assignments are
--       per-person rows, so removing one occupant clears only THEIR row —
--       a shared-room roommate keeps theirs)
--   personnel_rates.person_id          ON DELETE SET NULL (keep the rate
--       card's name if the canonical person is deleted)
--
-- Idempotent (re-runnable: ADD COLUMN IF NOT EXISTS, NOT EXISTS / IS NULL
-- guards, ON CONFLICT DO NOTHING). RLS inherited (personnel_rates,
-- room_assignments, tour_personnel, persons all already enforce
-- workspace-scoped policies — adding columns/rows changes nothing there).
-- Down block at the end.
-- ============================================

-- 1. New FK columns (nullable — backfilled below, left nullable so
--    un-matchable orphans survive and get flagged in the UI).
ALTER TABLE public.personnel_rates
  ADD COLUMN IF NOT EXISTS person_id uuid
    REFERENCES public.persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tour_personnel_id uuid
    REFERENCES public.tour_personnel(id) ON DELETE CASCADE;

ALTER TABLE public.room_assignments
  ADD COLUMN IF NOT EXISTS tour_personnel_id uuid
    REFERENCES public.tour_personnel(id) ON DELETE CASCADE;

-- 2. Ensure a canonical persons row for every payroll person_name.
--    (Workspace-scoped, case/whitespace-insensitive match; create on miss.)
INSERT INTO public.persons (workspace_id, full_name)
SELECT DISTINCT pr.workspace_id, btrim(pr.person_name)
FROM public.personnel_rates pr
WHERE btrim(coalesce(pr.person_name, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.workspace_id = pr.workspace_id
      AND lower(btrim(p.full_name)) = lower(btrim(pr.person_name))
  );

-- 3. Link personnel_rates.person_id by name match (one of any duplicates).
UPDATE public.personnel_rates pr
SET person_id = p.id
FROM public.persons p
WHERE pr.person_id IS NULL
  AND p.workspace_id = pr.workspace_id
  AND lower(btrim(p.full_name)) = lower(btrim(pr.person_name));

-- 4. Roster rows from PAYROLL — one per (tour, person, role). Role falls
--    back to person_type then 'crew'; employment_type carries person_type.
INSERT INTO public.tour_personnel
  (workspace_id, tour_id, person_id, role, employment_type)
SELECT DISTINCT
  pr.workspace_id,
  pr.tour_id,
  pr.person_id,
  coalesce(nullif(btrim(pr.role), ''), pr.person_type, 'crew') AS role,
  pr.person_type
FROM public.personnel_rates pr
WHERE pr.person_id IS NOT NULL
ON CONFLICT (tour_id, person_id, role) DO NOTHING;

-- 5. Roster rows from ROOMING — only for people NOT already on the roster
--    (rooming has no role, so don't spawn a spurious 'crew' duplicate for
--    someone already rostered under a real role). Tour via hotel.
INSERT INTO public.tour_personnel (workspace_id, tour_id, person_id, role)
SELECT DISTINCT ra.workspace_id, h.tour_id, ra.person_id, 'crew'
FROM public.room_assignments ra
JOIN public.rooms r  ON r.id = ra.room_id
JOIN public.hotels h ON h.id = r.hotel_id
WHERE h.tour_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tour_personnel tp
    WHERE tp.tour_id = h.tour_id AND tp.person_id = ra.person_id
  )
ON CONFLICT (tour_id, person_id, role) DO NOTHING;

-- 6. Link personnel_rates → roster. Prefer the exact-role roster row, then
--    fall back to any roster row for that person on the tour.
UPDATE public.personnel_rates pr
SET tour_personnel_id = tp.id
FROM public.tour_personnel tp
WHERE pr.tour_personnel_id IS NULL
  AND pr.person_id IS NOT NULL
  AND tp.tour_id = pr.tour_id
  AND tp.person_id = pr.person_id
  AND tp.role = coalesce(nullif(btrim(pr.role), ''), pr.person_type, 'crew');

UPDATE public.personnel_rates pr
SET tour_personnel_id = (
  SELECT tp.id FROM public.tour_personnel tp
  WHERE tp.tour_id = pr.tour_id AND tp.person_id = pr.person_id
  ORDER BY tp.created_at
  LIMIT 1
)
WHERE pr.tour_personnel_id IS NULL AND pr.person_id IS NOT NULL;

-- 7. Link room_assignments → roster (deterministic pick if multi-role).
UPDATE public.room_assignments ra
SET tour_personnel_id = (
  SELECT tp.id
  FROM public.tour_personnel tp
  JOIN public.rooms r  ON r.id = ra.room_id
  JOIN public.hotels h ON h.id = r.hotel_id
  WHERE tp.tour_id = h.tour_id AND tp.person_id = ra.person_id
  ORDER BY tp.created_at
  LIMIT 1
)
WHERE ra.tour_personnel_id IS NULL;

-- 8. Lookup indexes.
CREATE INDEX IF NOT EXISTS personnel_rates_tour_personnel_id_idx
  ON public.personnel_rates(tour_personnel_id);
CREATE INDEX IF NOT EXISTS personnel_rates_person_id_idx
  ON public.personnel_rates(person_id);
CREATE INDEX IF NOT EXISTS room_assignments_tour_personnel_id_idx
  ON public.room_assignments(tour_personnel_id);

COMMENT ON COLUMN public.personnel_rates.tour_personnel_id IS
  'Roster member this rate card belongs to (Personnel unification, mig 204).';
COMMENT ON COLUMN public.personnel_rates.person_id IS
  'Canonical person matched from person_name (Personnel unification, mig 204).';
COMMENT ON COLUMN public.room_assignments.tour_personnel_id IS
  'Roster member this room assignment belongs to (Personnel unification, mig 204).';

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert; backfill is not reversed)
-- ============================================
-- DROP INDEX IF EXISTS public.room_assignments_tour_personnel_id_idx;
-- DROP INDEX IF EXISTS public.personnel_rates_person_id_idx;
-- DROP INDEX IF EXISTS public.personnel_rates_tour_personnel_id_idx;
-- ALTER TABLE public.room_assignments DROP COLUMN IF EXISTS tour_personnel_id;
-- ALTER TABLE public.personnel_rates  DROP COLUMN IF EXISTS tour_personnel_id;
-- ALTER TABLE public.personnel_rates  DROP COLUMN IF EXISTS person_id;
