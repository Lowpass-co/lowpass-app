-- ============================================
-- LOWPASS — Migration tracking table
-- Migration 067
-- 2026-05-01
--
-- Records which database/migrations/*.sql files have been applied.
-- Used by `npm run db:migrate` (scripts/db-migrate.mjs) to diff the
-- directory against this table and apply only the missing files in
-- numeric order.
--
-- Every row is a single applied migration:
--   filename    — exact basename of the .sql file
--   checksum    — sha256(file_content).slice(0,16); the literal value
--                 'backfill' is reserved for migration 068's one-time
--                 backfill of pre-runner history (runner skips
--                 checksum validation when it sees that sentinel)
--   applied_at  — server-side default
--   applied_by  — process.env.USER on the runner host, or 'historical'
--                 for the backfill rows
--
-- 066 deliberately skipped to leave a gap below the runner bootstrap
-- pair so future feature-branch work can land sequentially without
-- colliding with 067/068.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + the policy DROP/CREATE
-- pair below. Safe to re-run.
--
-- Adam: paste this in the Supabase SQL Editor BEFORE running
-- `npm run db:migrate` for the first time. The runner refuses to
-- start until this table exists.
-- ============================================

CREATE TABLE IF NOT EXISTS public._lp_migrations (
  filename TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT
);

-- Service role bypasses RLS, so the runner can read/write. Anon and
-- authenticated users have no business reading or writing this table —
-- explicit policy returning false closes them off entirely.
ALTER TABLE public._lp_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "_lp_migrations_service_only" ON public._lp_migrations;
CREATE POLICY "_lp_migrations_service_only"
  ON public._lp_migrations FOR ALL
  USING (false) WITH CHECK (false);

COMMENT ON TABLE public._lp_migrations IS
  'Records applied migration filenames + checksums. Managed by npm run db:migrate (scripts/db-migrate.mjs). Do not edit by hand.';

-- ============================================
-- Down migration (manual — uncomment + run if needed)
-- ============================================
-- DROP POLICY IF EXISTS "_lp_migrations_service_only" ON public._lp_migrations;
-- DROP TABLE IF EXISTS public._lp_migrations;
