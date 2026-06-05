-- APPLY 114 in Supabase SQL Editor (AI Usage Tracking §AI-1)
--
-- Three tables: ai_usage_events (per-call log), ai_usage_limits
-- (per-workspace budget + default per-user caps), and
-- ai_usage_user_overrides (per-user cap overrides).
--
-- Costs in micro-USD (bigint) to avoid float drift. Default caps are
-- the conservative set: workspace $25/mo, per-user soft $2, hard $8.
-- Inserts are service-role only; reads are workspace-scoped.
--
-- -- line comments only (the dashboard trailing-quote bug breaks
-- /* */ blocks). Idempotent; safe to re-run.

-- Per-call event log
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint           text NOT NULL,
  model              text NOT NULL,
  input_tokens       integer NOT NULL DEFAULT 0,
  output_tokens      integer NOT NULL DEFAULT 0,
  cache_read_tokens  integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  cost_usd_micros    bigint NOT NULL DEFAULT 0,
  latency_ms         integer,
  status             text NOT NULL CHECK (status IN ('ok', 'error', 'blocked_cap')),
  error_message      text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_workspace_idx
  ON public.ai_usage_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_idx
  ON public.ai_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_endpoint_idx
  ON public.ai_usage_events (endpoint, created_at DESC);
-- No date_trunc('month', ...) index: date_trunc on timestamptz is not
-- IMMUTABLE so Postgres rejects it in an index. The workspace index
-- above serves month-range scans.

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_events_select ON public.ai_usage_events;
CREATE POLICY ai_usage_events_select ON public.ai_usage_events
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS ai_usage_events_insert ON public.ai_usage_events;
CREATE POLICY ai_usage_events_insert ON public.ai_usage_events
  FOR INSERT WITH CHECK (false);

-- Per-workspace budget + default per-user caps
CREATE TABLE IF NOT EXISTS public.ai_usage_limits (
  workspace_id                 uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  monthly_budget_usd_micros    bigint NOT NULL DEFAULT 25000000,
  per_user_soft_cap_usd_micros bigint NOT NULL DEFAULT 2000000,
  per_user_hard_cap_usd_micros bigint NOT NULL DEFAULT 8000000,
  alert_at_percent_50          boolean NOT NULL DEFAULT true,
  alert_at_percent_80          boolean NOT NULL DEFAULT true,
  alert_at_percent_100         boolean NOT NULL DEFAULT true,
  alert_recipients             text[] NOT NULL DEFAULT '{}',
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

-- Per-user cap overrides
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
