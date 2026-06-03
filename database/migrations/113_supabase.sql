-- ============================================
-- LOWPASS — PASTE-READY apply file for Migration 113
-- channel_list_rows.phantom_power → binary (NOT NULL)
-- §CL-FIX-3
-- ============================================
--
-- Adam: paste this whole block into the Supabase SQL Editor and
-- Run. It backfills, pins the column binary, and records the
-- migration in public._lp_migrations so the runner won't re-run
-- it. (Used because DATABASE_URL isn't in the local .env.)
--
-- ── STEP 0 — PRE-CHECK (run this FIRST, on its own) ──────────
-- Confirm the NULL rows are just "off", not a meaningful
-- "we haven't decided 48V yet" state. If the count is 0, or all
-- are genuinely off, proceed. If NULL carries meaning for you,
-- STOP and tell the agent — don't run the rest.
--
--   SELECT count(*) AS null_phantom_rows
--   FROM public.channel_list_rows
--   WHERE phantom_power IS NULL;
--
-- ── STEP 1 — APPLY (run after the pre-check looks safe) ──────

UPDATE public.channel_list_rows
  SET phantom_power = false
  WHERE phantom_power IS NULL;

ALTER TABLE public.channel_list_rows
  ALTER COLUMN phantom_power SET DEFAULT false;

ALTER TABLE public.channel_list_rows
  ALTER COLUMN phantom_power SET NOT NULL;

-- ── STEP 2 — record it as applied ───────────────────────────
INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES ('113_phantom_power_binary.sql', 'backfill', 'manual-supabase-editor')
ON CONFLICT (filename) DO NOTHING;
