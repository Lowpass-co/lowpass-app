-- ============================================
-- LOWPASS — Initial site admin promotions
-- Migration 062
--
-- 036_site_admins.sql added the profiles.is_site_admin flag for
-- triaging bug reports at /bugs. Adam and Ben were promoted via
-- direct SQL on 2026-04-29; this records that as a tracked
-- migration so the production state is reproducible.
--
-- Numbering note: 061 is intentionally reserved for the RLS audit
-- migration that lands alongside CC_RLS_AUDIT_MIGRATION.md. Do not
-- backfill 061 with anything else.
--
-- In non-production environments these emails won't exist, so the
-- UPDATE affects 0 rows — that's the expected behaviour. Site
-- admin promotion in any other environment should happen through
-- a separate process (e.g. seed data or manual SQL by an env owner).
-- ============================================

UPDATE public.profiles
SET is_site_admin = TRUE
WHERE email IN ('adam@lowpass.co', 'ben@lowpass.co')
  AND is_site_admin = FALSE;

-- Down (commented):
-- UPDATE public.profiles
-- SET is_site_admin = FALSE
-- WHERE email IN ('adam@lowpass.co', 'ben@lowpass.co');
