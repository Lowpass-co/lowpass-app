-- ============================================
-- LOWPASS — AI suggestions opt-in preference
-- Migration 210
--
-- Adds a per-user, self-service preference for whether the in-panel
-- AI assistant (LLM suggestions + rules findings) fires automatically,
-- plus a per-workspace default. Tristate user pref: NULL = follow the
-- workspace default; TRUE/FALSE = explicit user choice.
--
-- NOTE: deliberately a NEW table, not a column on ai_usage_user_overrides
-- — that table is admin-write-only (migration 114); this preference is
-- self-service, so it needs its own self-write RLS.
-- ============================================

-- 1. Workspace default (extend the existing limits table)
ALTER TABLE public.ai_usage_limits
  ADD COLUMN IF NOT EXISTS ai_suggestions_default_enabled boolean NOT NULL DEFAULT false;

-- 2. Per-user preference (tristate)
CREATE TABLE IF NOT EXISTS public.user_ai_preferences (
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestions_enabled boolean,           -- NULL = follow workspace default
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE public.user_ai_preferences ENABLE ROW LEVEL SECURITY;

-- SELECT: the user reads their own row; workspace admins read all rows in
-- their workspace (for the future /settings/team opt-out display).
DROP POLICY IF EXISTS user_ai_preferences_select ON public.user_ai_preferences;
CREATE POLICY user_ai_preferences_select ON public.user_ai_preferences
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND (user_id = auth.uid() OR public.is_workspace_admin())
  );

-- INSERT/UPDATE/DELETE: a user writes ONLY their own row, in their workspace.
DROP POLICY IF EXISTS user_ai_preferences_write ON public.user_ai_preferences;
CREATE POLICY user_ai_preferences_write ON public.user_ai_preferences
  FOR ALL USING (
    workspace_id = public.get_my_workspace_id() AND user_id = auth.uid()
  )
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND user_id = auth.uid()
  );

-- ============================================
-- DOWN (manual)
-- DROP TABLE IF EXISTS public.user_ai_preferences CASCADE;
-- ALTER TABLE public.ai_usage_limits DROP COLUMN IF EXISTS ai_suggestions_default_enabled;
-- ============================================
