-- ============================================
-- LOWPASS — export_templates (#8 Document Export, Template Builder Phase 3)
-- Migration 224
-- ============================================
--
-- Saved export templates: a named, reusable TemplateConfig per surface, shared
-- across all of a workspace's tours (the config is presentation-only — it can
-- never change a number).
--
-- D-SHARE (signed off): templates are WORKSPACE-scoped (workspace_id =
-- get_my_workspace_id()) — shared across that workspace's tours, never across
-- tenants (RLS isolates workspaces). PLUS a read-only GLOBAL tier
-- (workspace_id IS NULL) = Lowpass house styles, readable by ALL workspaces but
-- writable only by admin/SQL (the client CRUD route never writes a NULL
-- workspace_id). Using a global/another template is COPY-ON-APPLY in the client
-- (its config loads into the editor; saving creates a workspace-owned row) — never
-- a shared mutable row.
--
-- D-APPLY (signed off): a workspace `is_default` per surface; the export picks the
-- chosen template's config, defaulting to the workspace default. The tour does NOT
-- store a template_id (render-time selection only).
--
-- Idempotent; RLS via get_my_workspace_id(); partial unique index = one default per
-- (workspace, surface). Down-block at the end.
-- ============================================

CREATE TABLE IF NOT EXISTS public.export_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = the global (Lowpass house) tier — admin/SQL authored, read-only to clients.
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  surface      text NOT NULL CHECK (surface IN ('budget', 'rooming', 'payroll', 'routing')),
  name         text NOT NULL,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default   boolean NOT NULL DEFAULT false,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- A global template (no workspace) can never be a workspace default.
  CONSTRAINT export_templates_global_not_default CHECK (NOT is_default OR workspace_id IS NOT NULL)
);

ALTER TABLE public.export_templates ENABLE ROW LEVEL SECURITY;

-- One default per (workspace, surface). (Global rows have workspace_id NULL and
-- can't be is_default per the CHECK, so they never collide here.)
CREATE UNIQUE INDEX IF NOT EXISTS export_templates_one_default
  ON public.export_templates (workspace_id, surface) WHERE is_default;

CREATE INDEX IF NOT EXISTS export_templates_ws_surface_idx
  ON public.export_templates (workspace_id, surface);

-- SELECT: own-workspace rows + the global tier (readable by everyone).
DROP POLICY IF EXISTS export_templates_select ON public.export_templates;
CREATE POLICY export_templates_select ON public.export_templates
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id() OR workspace_id IS NULL
  );

-- INSERT/UPDATE/DELETE: own-workspace rows ONLY. workspace_id must equal the
-- caller's workspace (never NULL) → the global tier is read-only to clients.
DROP POLICY IF EXISTS export_templates_insert ON public.export_templates;
CREATE POLICY export_templates_insert ON public.export_templates
  FOR INSERT WITH CHECK ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS export_templates_update ON public.export_templates;
CREATE POLICY export_templates_update ON public.export_templates
  FOR UPDATE USING ( workspace_id = public.get_my_workspace_id() )
  WITH CHECK ( workspace_id = public.get_my_workspace_id() );

DROP POLICY IF EXISTS export_templates_delete ON public.export_templates;
CREATE POLICY export_templates_delete ON public.export_templates
  FOR DELETE USING ( workspace_id = public.get_my_workspace_id() );

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.export_templates CASCADE;
   ============================================================ */
