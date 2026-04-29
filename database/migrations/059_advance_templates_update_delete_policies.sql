-- ============================================
-- LOWPASS — advance_templates UPDATE/DELETE RLS policies
-- Migration 059
--
-- 011_advance_system_enhancements.sql added at_select / at_insert
-- but never UPDATE or DELETE. With default-deny RLS, the existing
-- DELETE API (and any future PATCH that goes through the user-session
-- client) silently affects 0 rows — Supabase returns success, the
-- API returns 204, the client optimistically removes from local
-- state, then fetchTemplates() repopulates the still-present row.
-- User-visible symptom: confirm modal closes, custom section
-- ("Support / Act / Who is…") reappears in the Custom block.
--
-- Add UPDATE and DELETE policies, scoped to workspace ownership.
-- Platform templates (workspace_id IS NULL) remain immutable to
-- end users — no workspace owns them, so the gate fails.
-- ============================================

DROP POLICY IF EXISTS "at_update" ON public.advance_templates;
CREATE POLICY "at_update"
  ON public.advance_templates FOR UPDATE
  USING (workspace_id IS NOT NULL AND workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id IS NOT NULL AND workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "at_delete" ON public.advance_templates;
CREATE POLICY "at_delete"
  ON public.advance_templates FOR DELETE
  USING (workspace_id IS NOT NULL AND workspace_id = public.get_my_workspace_id());

-- ============================================
-- Down migration (commented out for safety; uncomment to roll back)
-- ============================================
-- DROP POLICY IF EXISTS "at_update" ON public.advance_templates;
-- DROP POLICY IF EXISTS "at_delete" ON public.advance_templates;
