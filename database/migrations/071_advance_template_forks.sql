-- ============================================
-- LOWPASS — Advance template forks
-- Migration 071
--
-- Sprint 8.6 §6 — Adam's call: "needs to be added to the
-- headers library for all future tours NOT tour specific. User
-- specific (workspace)."
--
-- When a user adds a custom field to a platform-template
-- section in the canvas, the field is added to a workspace-
-- scoped FORK of that platform template. Future tours in the
-- workspace inherit the customization (the library replaces
-- the platform template with the workspace fork).
--
-- Schema: advance_templates gains a forked_from_id column that
-- references the platform template. NULL = original (platform
-- or workspace template not derived from anything).
--
-- The library API (/api/advance/templates) filters out platform
-- templates that have a workspace fork — the fork replaces the
-- parent in the listing, so each section appears once.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, no destructive change.
-- ============================================

ALTER TABLE public.advance_templates
  ADD COLUMN IF NOT EXISTS forked_from_id uuid
    REFERENCES public.advance_templates(id) ON DELETE SET NULL;

-- Index for the workspace-fork lookup at /api/advance/templates.
-- The query: SELECT id FROM advance_templates WHERE workspace_id
-- = $w AND forked_from_id IS NOT NULL. This composite index
-- supports it.
CREATE INDEX IF NOT EXISTS advance_templates_workspace_fork_idx
  ON public.advance_templates (workspace_id, forked_from_id)
  WHERE forked_from_id IS NOT NULL;

COMMENT ON COLUMN public.advance_templates.forked_from_id IS
  'Sprint 8.6 §6 — workspace-scoped templates created by '
  '"+ Add custom field" reference the platform template they '
  'were forked from. The library API replaces the platform '
  'template with its workspace fork in the listing so each '
  'section appears once. ON DELETE SET NULL so a platform '
  'template deletion doesn''t cascade-delete workspace customizations.';

-- ============================================
-- Down migration (manual)
-- ============================================
-- ALTER TABLE public.advance_templates
--   DROP COLUMN IF EXISTS forked_from_id;
-- DROP INDEX IF EXISTS public.advance_templates_workspace_fork_idx;
-- Workspace fork rows would no longer be linked to their
-- platform parent; the library API would show both.
