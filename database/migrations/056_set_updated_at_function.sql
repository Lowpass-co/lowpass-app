-- ============================================
-- LOWPASS — Shared set_updated_at trigger function
-- Migration 056
-- ============================================
--
-- Migrations 049 (flight), 050 (person), 051 (room), 052 (gear), 053 (deal-memos),
-- 055 (expenses) all reference public.set_updated_at() as the BEFORE UPDATE trigger
-- function for their canonical entity tables. The function was never defined — the
-- pre-UX-overhaul convention was per-table functions (bug_reports_set_updated_at,
-- rider_packs_set_updated_at, channel_list_rows_set_updated_at, etc).
--
-- Defining it here as the canonical shared function so the UX-era migrations can
-- run cleanly. Idempotent (CREATE OR REPLACE) so safe to re-apply.
--
-- Going forward, new migrations should use this function rather than create
-- per-table copies. The per-table functions in earlier migrations stay as-is
-- (don't break existing triggers).

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Permissions: callable by row triggers in any schema (RLS-bypass via SECURITY DEFINER
-- not required — this is a pure data shaping function with no privileged access).
