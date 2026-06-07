-- ============================================
-- LOWPASS — External-API usage: provider column (Security hardening §H2/§AI-EXT)
-- Migration 205
-- ============================================
--
-- The AI usage system (migration 114) logs one row per Anthropic call to
-- public.ai_usage_events with a micro-USD cost, and enforces per-user +
-- per-workspace caps via the withAiUsage() wrapper. This migration widens
-- that same table to also flag + meter Google API calls (Geocoding,
-- Directions, Places, Custom Search), which until now were unauthenticated
-- and unmetered (audit finding H2).
--
-- One additive change: a `provider` column.
--   'anthropic' — existing behaviour, the default (all historical rows
--                 backfill to this via the column DEFAULT).
--   'google'    — rows written by the new withGoogleUsage() wrapper.
--
-- The Anthropic dollar-cap math (src/lib/ai/usage.ts → sumMonthCost) filters
-- to provider <> 'google' so Google volume never silently consumes the
-- Anthropic $ budget; Google has its own request-count limiter in code.
--
-- IMPORTANT (deploy order): apply this migration BEFORE deploying the code
-- that sets/reads `provider`, or the withGoogleUsage insert will fail on the
-- missing column. Standard migrate-then-deploy for this repo.
--
-- Idempotent — safe to re-run. Recorded in public._lp_migrations on apply.
-- ============================================

ALTER TABLE public.ai_usage_events
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'anthropic';

-- Constrain to known providers (drop-and-recreate so re-runs are clean).
ALTER TABLE public.ai_usage_events
  DROP CONSTRAINT IF EXISTS ai_usage_events_provider_chk;
ALTER TABLE public.ai_usage_events
  ADD CONSTRAINT ai_usage_events_provider_chk
  CHECK (provider IN ('anthropic', 'google'));

-- Provider-scoped time-series index for the rate-limit window count
-- (per-user google calls in the last hour) and the usage dashboard split.
CREATE INDEX IF NOT EXISTS ai_usage_events_provider_user_idx
  ON public.ai_usage_events (provider, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_provider_ws_idx
  ON public.ai_usage_events (provider, workspace_id, created_at DESC);

-- RLS is unchanged: existing ai_usage_events_select (workspace-scoped read)
-- and ai_usage_events_insert (WITH CHECK false — service-role only) already
-- cover the new rows. The withGoogleUsage wrapper inserts via the
-- service-role client exactly like withAiUsage.

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP INDEX IF EXISTS public.ai_usage_events_provider_ws_idx;
   DROP INDEX IF EXISTS public.ai_usage_events_provider_user_idx;
   ALTER TABLE public.ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_provider_chk;
   ALTER TABLE public.ai_usage_events DROP COLUMN IF EXISTS provider;
   ============================================================ */
