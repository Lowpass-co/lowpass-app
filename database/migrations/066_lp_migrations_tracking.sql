-- ============================================
-- LOWPASS — Migration tracking table
-- Migration 066
--
-- Records which database/migrations/*.sql files have been applied.
-- Used by `npm run db:migrate` (scripts/db-migrate.mjs) to diff the
-- directory against this table and apply only the missing files in
-- numeric order.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS.
--
-- Adam: paste this migration into Supabase SQL Editor BEFORE running
-- `npm run db:migrate` for the first time. The runner refuses to start
-- if the tracking table doesn't exist (chicken-and-egg avoidance).
-- ============================================

CREATE TABLE IF NOT EXISTS public._lp_migrations (
  filename TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT
);

-- Service-role only. anon and authenticated have no business reading
-- or writing this — there's nothing here they need.
ALTER TABLE public._lp_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "_lp_migrations_service_only" ON public._lp_migrations;
CREATE POLICY "_lp_migrations_service_only"
  ON public._lp_migrations FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public._lp_migrations IS
  'Records applied migration filenames. Managed by npm run db:migrate. Do not edit by hand.';

-- Down (commented; uncomment to roll back manually):
-- DROP POLICY IF EXISTS "_lp_migrations_service_only" ON public._lp_migrations;
-- DROP TABLE IF EXISTS public._lp_migrations;
