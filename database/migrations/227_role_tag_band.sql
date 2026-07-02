-- ============================================
-- LOWPASS — add 'band' to tour_personnel.role_tag (revamp #20)
-- Migration 227
-- ============================================
--
-- The personnel role-tag list was missing a BAND tag (musicians / performers).
-- role_tag is guarded by a CHECK constraint (migration 101), so the app-level
-- enum can't add 'band' until the DB accepts it. Drop + recreate the CHECK with
-- 'band' included. Idempotent: the constraint is dropped-if-exists first, and
-- 'band' is additive so existing rows still satisfy it.
-- ============================================

DO $$
BEGIN
  ALTER TABLE public.tour_personnel
    DROP CONSTRAINT IF EXISTS tour_personnel_role_tag_check;

  ALTER TABLE public.tour_personnel
    ADD CONSTRAINT tour_personnel_role_tag_check
    CHECK (role_tag IN (
      'tm', 'tm2', 'pm', 'foh', 'mons',
      'ld', 'backline', 'band', 'management', 'other'
    ));
END $$;

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   -- Reverting requires no row with role_tag = 'band' to remain.
   -- UPDATE public.tour_personnel SET role_tag = 'other' WHERE role_tag = 'band';
   -- ALTER TABLE public.tour_personnel DROP CONSTRAINT IF EXISTS tour_personnel_role_tag_check;
   -- ALTER TABLE public.tour_personnel ADD CONSTRAINT tour_personnel_role_tag_check
   --   CHECK (role_tag IN ('tm','tm2','pm','foh','mons','ld','backline','management','other'));
   ============================================================ */
