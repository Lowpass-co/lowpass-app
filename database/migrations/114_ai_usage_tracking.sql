/* ============================================================
   MIGRATION 114 — AI usage tracking (CC_AI_USAGE_TRACKING §AI-1)

   Per-call cost attribution for every Anthropic API call, plus
   per-workspace budgets and per-user caps. Three tables:

     ai_usage_events         one row per Anthropic call (who/when/cost)
     ai_usage_limits         per-workspace budget + default per-user caps
     ai_usage_user_overrides optional per-user cap overrides

   Costs stored as micro-USD (bigint) to avoid float drift — Anthropic
   bills in USD; display is USD-only (no FX). Default caps are the
   conservative set (Adam, 2026-06): workspace $25/mo, per-user soft
   $2, hard $8.

   Inserts are service-role only (the wrapper writes events; the UI
   never inserts). Reads are workspace-scoped via RLS; the site-admin
   cross-workspace dashboard reads through the service-role client
   behind its own gate (§AI-4), so no cross-workspace RLS is needed.

   Idempotent — safe to re-run. The runner records this file in
   public._lp_migrations on apply (no manual tracking insert here,
   matching the 106 precedent).
   ============================================================ */

-- ── Per-call event log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint           text NOT NULL,             -- e.g. 'budget.ai.suggest'
  model              text NOT NULL,             -- e.g. 'claude-haiku-4-5-20251001'
  input_tokens       integer NOT NULL DEFAULT 0,
  output_tokens      integer NOT NULL DEFAULT 0,
  cache_read_tokens  integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  cost_usd_micros    bigint NOT NULL DEFAULT 0, -- micro-USD (1e-6 USD)
  latency_ms         integer,
  status             text NOT NULL CHECK (status IN ('ok', 'error', 'blocked_cap')),
  error_message      text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- pack_id, tour_id, etc.
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_workspace_idx
  ON public.ai_usage_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_idx
  ON public.ai_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_endpoint_idx
  ON public.ai_usage_events (endpoint, created_at DESC);
-- NOTE: a date_trunc('month', created_at) expression index is NOT
-- possible — date_trunc on timestamptz is STABLE, not IMMUTABLE, so
-- Postgres rejects it in an index. Month-range queries
-- (created_at >= month_start AND < next_month) use the
-- (workspace_id, created_at DESC) index above via range scan.

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Workspace members read their own workspace's events (the user widget
-- filters to self client-side; the cross-workspace dashboard uses the
-- service-role client behind the site-admin gate).
DROP POLICY IF EXISTS ai_usage_events_select ON public.ai_usage_events;
CREATE POLICY ai_usage_events_select ON public.ai_usage_events
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

-- No client inserts ever — the service-role wrapper bypasses RLS.
DROP POLICY IF EXISTS ai_usage_events_insert ON public.ai_usage_events;
CREATE POLICY ai_usage_events_insert ON public.ai_usage_events
  FOR INSERT WITH CHECK (false);

-- ── Per-workspace budget + default per-user caps ────────────────────
CREATE TABLE IF NOT EXISTS public.ai_usage_limits (
  workspace_id                 uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  monthly_budget_usd_micros    bigint NOT NULL DEFAULT 25000000,  -- $25/month
  per_user_soft_cap_usd_micros bigint NOT NULL DEFAULT 2000000,   -- $2 — warn
  per_user_hard_cap_usd_micros bigint NOT NULL DEFAULT 8000000,   -- $8 — block
  alert_at_percent_50          boolean NOT NULL DEFAULT true,
  alert_at_percent_80          boolean NOT NULL DEFAULT true,
  alert_at_percent_100         boolean NOT NULL DEFAULT true,
  alert_recipients             text[] NOT NULL DEFAULT '{}',  -- emails; falls back to workspace admins
  last_50_alert_sent_at        timestamptz,
  last_80_alert_sent_at        timestamptz,
  last_100_alert_sent_at       timestamptz,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_limits_select ON public.ai_usage_limits;
CREATE POLICY ai_usage_limits_select ON public.ai_usage_limits
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS ai_usage_limits_insert ON public.ai_usage_limits;
CREATE POLICY ai_usage_limits_insert ON public.ai_usage_limits
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

DROP POLICY IF EXISTS ai_usage_limits_update ON public.ai_usage_limits;
CREATE POLICY ai_usage_limits_update ON public.ai_usage_limits
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  )
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

-- ── Per-user cap overrides (admin grants a user a higher/lower cap) ──
CREATE TABLE IF NOT EXISTS public.ai_usage_user_overrides (
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  soft_cap_usd_micros bigint,
  hard_cap_usd_micros bigint,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE public.ai_usage_user_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_user_overrides_select ON public.ai_usage_user_overrides;
CREATE POLICY ai_usage_user_overrides_select ON public.ai_usage_user_overrides
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS ai_usage_user_overrides_write ON public.ai_usage_user_overrides;
CREATE POLICY ai_usage_user_overrides_write ON public.ai_usage_user_overrides
  FOR ALL USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  )
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.ai_usage_user_overrides CASCADE;
   DROP TABLE IF EXISTS public.ai_usage_limits CASCADE;
   DROP TABLE IF EXISTS public.ai_usage_events CASCADE;
   ============================================================ */
