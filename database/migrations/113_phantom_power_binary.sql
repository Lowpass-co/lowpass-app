-- ============================================
-- LOWPASS — channel_list_rows.phantom_power → binary (NOT NULL)
-- Migration 113
-- ============================================
--
-- §CL-FIX-3. phantom_power was BOOLEAN NULLABLE, giving the
-- channel-list editor three visible states (on / off / n-a).
-- Adam wants a binary on/off toggle. This migration collapses
-- the third (NULL) state into `false` and pins the column
-- NOT NULL DEFAULT false so no new NULLs can appear.
--
-- PRE-CHECK (run before applying — see 113_supabase.sql):
--   SELECT count(*) FROM public.channel_list_rows
--   WHERE phantom_power IS NULL;
-- Confirm those NULL rows are "off", not a meaningful
-- "undecided" state, before collapsing them.
--
-- Numbering: main is at 111 (rider). 114_ai_usage_tracking.sql is
-- committed on a sibling branch (it renumbered off 112 during this
-- sprint's churn). 112 and 113 are both free; picked 113 to stay
-- clear of the moving ai-usage migration. Collision-checked across
-- all refs per migrations/README §Numbering.
--
-- Idempotent: the UPDATE only touches NULLs, and re-running
-- SET DEFAULT / SET NOT NULL on an already-converged column is
-- a no-op. Safe to re-run.
-- ============================================

-- 1. Collapse the third state: NULL → false.
UPDATE public.channel_list_rows
  SET phantom_power = false
  WHERE phantom_power IS NULL;

-- 2. Pin the column binary.
ALTER TABLE public.channel_list_rows
  ALTER COLUMN phantom_power SET DEFAULT false;

ALTER TABLE public.channel_list_rows
  ALTER COLUMN phantom_power SET NOT NULL;

-- ============================================
-- DOWN MIGRATION (manual)
-- --------------------------------------------
-- ALTER TABLE public.channel_list_rows
--   ALTER COLUMN phantom_power DROP NOT NULL;
-- ALTER TABLE public.channel_list_rows
--   ALTER COLUMN phantom_power DROP DEFAULT;
-- -- (the NULL→false backfill is not reversible — the original
-- --  NULL/false split is not recorded. Restore from a backup
-- --  if the tri-state must come back.)
-- ============================================
