-- ============================================
-- LOWPASS — Advance rebuild (board, per-day templates, info packs)
-- Migration 276
-- ============================================
--
-- Paste into the Supabase SQL Editor and Run. Paste 275 first. Safe to paste
-- twice: every column is ADD … IF NOT EXISTS, tables are CREATE … IF NOT
-- EXISTS, policies are dropped before they are re-created, the function is
-- CREATE OR REPLACE, and the template copy skips rows it already copied.
-- Nothing here deletes or rewrites existing answers.
--
-- WHAT IT ADDS
--   1. Templates are workspace-wide (advance_layout_templates). The old
--      per-tour templates (advance_form_configs.is_template) are COPIED in
--      once, remembered by source_config_id so a re-run never copies twice.
--      The originals are left where they are.
--   2. advance_day_type_templates — which template each day type gets
--      ('show' → "Show day" …). New days take it automatically.
--   3. advance_form_configs.layout_template_id + customised — which template a
--      day came from, and whether the day has been changed by hand (so a
--      template change never overwrites a customised day).
--   4. advance_instances.field_sources — where each answer came from (an info
--      pack page + the quote, a venue answer, typed by you).
--   5. advance_intake_links.sent_at — when you sent the request (Open in Gmail
--      / Copy email), as opposed to when the link was made; ask_fields — the
--      questions a request asks (all, or just the ones still missing).
--   6. advance_documents — info packs kept with a show.
--   7. advance_merge_answers() — writes changed answers in ONE statement,
--      merging into the stored JSON instead of replacing it, so two tabs (or
--      you and a venue accept) can't overwrite each other's fields.
-- ============================================

-- 1. Workspace templates ------------------------------------------------------
ALTER TABLE public.advance_layout_templates ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.advance_layout_templates ADD COLUMN IF NOT EXISTS source_config_id uuid;

INSERT INTO public.advance_layout_templates (workspace_id, name, sections, source_config_id)
SELECT t.workspace_id,
       COALESCE(NULLIF(trim(c.template_label), ''), NULLIF(trim(c.name), ''), 'Untitled template'),
       COALESCE(c.sections, '[]'::jsonb),
       c.id
FROM public.advance_form_configs c
JOIN public.tours t ON t.id = c.tour_id
WHERE c.is_template = true
  AND t.workspace_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.advance_layout_templates l WHERE l.source_config_id = c.id
  );

-- 2. Day type → template ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.advance_day_type_templates (
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  day_type           text NOT NULL,
  layout_template_id uuid NOT NULL REFERENCES public.advance_layout_templates(id) ON DELETE CASCADE,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, day_type)
);
ALTER TABLE public.advance_day_type_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS advance_day_type_templates_select ON public.advance_day_type_templates;
CREATE POLICY advance_day_type_templates_select ON public.advance_day_type_templates
  FOR SELECT USING ( workspace_id = public.get_my_workspace_id() );
DROP POLICY IF EXISTS advance_day_type_templates_insert ON public.advance_day_type_templates;
CREATE POLICY advance_day_type_templates_insert ON public.advance_day_type_templates
  FOR INSERT WITH CHECK ( workspace_id = public.get_my_workspace_id() );
DROP POLICY IF EXISTS advance_day_type_templates_update ON public.advance_day_type_templates;
CREATE POLICY advance_day_type_templates_update ON public.advance_day_type_templates
  FOR UPDATE USING ( workspace_id = public.get_my_workspace_id() )
  WITH CHECK ( workspace_id = public.get_my_workspace_id() );
DROP POLICY IF EXISTS advance_day_type_templates_delete ON public.advance_day_type_templates;
CREATE POLICY advance_day_type_templates_delete ON public.advance_day_type_templates
  FOR DELETE USING ( workspace_id = public.get_my_workspace_id() );

-- 3. Which template a day came from -------------------------------------------
ALTER TABLE public.advance_form_configs ADD COLUMN IF NOT EXISTS layout_template_id uuid
  REFERENCES public.advance_layout_templates(id) ON DELETE SET NULL;
ALTER TABLE public.advance_form_configs ADD COLUMN IF NOT EXISTS customised boolean NOT NULL DEFAULT false;

-- 4. Where answers came from ---------------------------------------------------
ALTER TABLE public.advance_instances ADD COLUMN IF NOT EXISTS field_sources jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5. When the request was sent -----------------------------------------------
ALTER TABLE public.advance_intake_links ADD COLUMN IF NOT EXISTS sent_at timestamptz;
-- Which questions this request asks ("<section>:<field>"); NULL = every
-- question the venue can answer. Lets you send only what's still missing.
ALTER TABLE public.advance_intake_links ADD COLUMN IF NOT EXISTS ask_fields text[];

-- 6. Info packs kept with a show ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.advance_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id       uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id    uuid NOT NULL REFERENCES public.routing(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text,
  size_bytes    bigint,
  page_count    integer,
  answers_used  integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advance_documents_routing_idx ON public.advance_documents (routing_id, created_at DESC);
ALTER TABLE public.advance_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS advance_documents_select ON public.advance_documents;
CREATE POLICY advance_documents_select ON public.advance_documents
  FOR SELECT USING ( workspace_id = public.get_my_workspace_id() );
DROP POLICY IF EXISTS advance_documents_insert ON public.advance_documents;
CREATE POLICY advance_documents_insert ON public.advance_documents
  FOR INSERT WITH CHECK ( workspace_id = public.get_my_workspace_id() );
DROP POLICY IF EXISTS advance_documents_update ON public.advance_documents;
CREATE POLICY advance_documents_update ON public.advance_documents
  FOR UPDATE USING ( workspace_id = public.get_my_workspace_id() )
  WITH CHECK ( workspace_id = public.get_my_workspace_id() );
DROP POLICY IF EXISTS advance_documents_delete ON public.advance_documents;
CREATE POLICY advance_documents_delete ON public.advance_documents
  FOR DELETE USING ( workspace_id = public.get_my_workspace_id() );

-- 7. Merge answers in one statement -------------------------------------------
-- p_changes: { "<section template id>": { "<field id>": value, … }, … }
-- p_sources: { "<section>:<field>": { kind, … } | null, … }  (null clears)
-- SECURITY INVOKER (the default): advance_instances RLS applies as for any
-- update by this user.
CREATE OR REPLACE FUNCTION public.advance_merge_answers(
  p_instance uuid,
  p_changes  jsonb,
  p_sources  jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE sql
AS $$
  UPDATE public.advance_instances i
  SET data = COALESCE(i.data, '{}'::jsonb) || COALESCE((
        SELECT jsonb_object_agg(
                 e.k,
                 CASE WHEN jsonb_typeof(i.data -> e.k) = 'object' THEN i.data -> e.k ELSE '{}'::jsonb END || e.v
               )
        FROM jsonb_each(COALESCE(p_changes, '{}'::jsonb)) AS e(k, v)
        WHERE jsonb_typeof(e.v) = 'object'
      ), '{}'::jsonb),
      field_sources = (
        SELECT COALESCE(jsonb_object_agg(s.k, s.v), '{}'::jsonb)
        FROM jsonb_each(COALESCE(i.field_sources, '{}'::jsonb) || COALESCE(p_sources, '{}'::jsonb)) AS s(k, v)
        WHERE jsonb_typeof(s.v) <> 'null'
      ),
      last_updated_at = now(),
      last_updated_by_id = auth.uid()
  WHERE i.id = p_instance
  RETURNING jsonb_build_object('data', i.data, 'field_sources', i.field_sources, 'last_updated_at', i.last_updated_at);
$$;
GRANT EXECUTE ON FUNCTION public.advance_merge_answers(uuid, jsonb, jsonb) TO authenticated;

-- Check (expect the new objects):
-- SELECT count(*) FROM public.advance_layout_templates WHERE source_config_id IS NOT NULL;
-- SELECT to_regclass('public.advance_documents'), to_regclass('public.advance_day_type_templates');

-- ============================================
-- DOWN (drops info packs' records and the day-type mapping; answers untouched):
-- DROP FUNCTION IF EXISTS public.advance_merge_answers(uuid, jsonb, jsonb);
-- DROP TABLE IF EXISTS public.advance_documents;
-- ALTER TABLE public.advance_intake_links DROP COLUMN IF EXISTS ask_fields;
-- ALTER TABLE public.advance_intake_links DROP COLUMN IF EXISTS sent_at;
-- ALTER TABLE public.advance_instances DROP COLUMN IF EXISTS field_sources;
-- ALTER TABLE public.advance_form_configs DROP COLUMN IF EXISTS customised;
-- ALTER TABLE public.advance_form_configs DROP COLUMN IF EXISTS layout_template_id;
-- DROP TABLE IF EXISTS public.advance_day_type_templates;
-- DELETE FROM public.advance_layout_templates WHERE source_config_id IS NOT NULL;
-- ALTER TABLE public.advance_layout_templates DROP COLUMN IF EXISTS source_config_id;
-- ALTER TABLE public.advance_layout_templates DROP COLUMN IF EXISTS updated_at;
-- ============================================
