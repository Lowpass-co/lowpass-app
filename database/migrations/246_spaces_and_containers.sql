-- ============================================================================
-- 246_spaces_and_containers.sql
--
-- S1 Stage B (1/5) — the Spaces spine. Two workspace-scoped tables that gear
-- items get placed into:
--
--   spaces      — warehouse | vehicle | locker | venue | other. Optional
--                 monthly/tour cost so a storage space can derive a budget line
--                 on the tour using it (Stage D, extends the tour_gear pattern).
--   containers  — case / cart / box, optionally inside a space (nullable FK).
--
-- Gear gains space_id / container_id in migration 247. Weight/value rollups are
-- computed at READ time per container/space/tour — no denormalised totals here.
--
-- HAND-APPLIED: paste into the Supabase SQL editor. Idempotent / re-runnable;
-- canonical 4-policy RLS (get_my_workspace_id / is_workspace_admin); down-block
-- at the end. No engine code depends on it until Adam confirms "pasted".
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.spaces (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL DEFAULT 'other'
                          CHECK (kind IN ('warehouse','vehicle','locker','venue','other')),
  name                  TEXT NOT NULL,
  dimensions_cm         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Optional recurring cost → a derived budget line on the tour using the space
  -- (Stage D). Both null = no cost.
  monthly_cost_amount   NUMERIC(12,2),
  cost_currency         TEXT NOT NULL DEFAULT 'GBP',
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spaces_workspace_idx ON public.spaces(workspace_id);

CREATE TABLE IF NOT EXISTS public.containers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Nullable: a container can exist unplaced (the "unassigned" bucket).
  space_id              UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  kind                  TEXT NOT NULL DEFAULT 'case'
                          CHECK (kind IN ('case','cart','box','bag','other')),
  name                  TEXT NOT NULL,
  dimensions_cm         JSONB NOT NULL DEFAULT '{}'::jsonb,
  weight_empty_kg       NUMERIC(10,3),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS containers_workspace_idx ON public.containers(workspace_id);
CREATE INDEX IF NOT EXISTS containers_space_idx ON public.containers(space_id);

-- RLS — canonical 4-policy, workspace-scoped; delete admin-gated.
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spaces_select ON public.spaces;
CREATE POLICY spaces_select ON public.spaces FOR SELECT USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS spaces_insert ON public.spaces;
CREATE POLICY spaces_insert ON public.spaces FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS spaces_update ON public.spaces;
CREATE POLICY spaces_update ON public.spaces FOR UPDATE USING (workspace_id = public.get_my_workspace_id()) WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS spaces_delete ON public.spaces;
CREATE POLICY spaces_delete ON public.spaces FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

ALTER TABLE public.containers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS containers_select ON public.containers;
CREATE POLICY containers_select ON public.containers FOR SELECT USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS containers_insert ON public.containers;
CREATE POLICY containers_insert ON public.containers FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS containers_update ON public.containers;
CREATE POLICY containers_update ON public.containers FOR UPDATE USING (workspace_id = public.get_my_workspace_id()) WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS containers_delete ON public.containers;
CREATE POLICY containers_delete ON public.containers FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

COMMIT;

-- ============================================================================
-- DOWN (manual — paste to reverse):
-- BEGIN;
-- DROP TABLE IF EXISTS public.containers;
-- DROP TABLE IF EXISTS public.spaces;
-- COMMIT;
-- ============================================================================
