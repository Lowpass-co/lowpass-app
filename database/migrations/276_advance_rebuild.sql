-- ============================================
-- LOWPASS — Advance rebuild (board, per-day templates, info packs)
-- Migration 276
-- ============================================
--
-- Paste into the Supabase SQL Editor and Run. Paste 275 first. It checks
-- first and stops, changing nothing, if a column it relies on is missing (the
-- error names them all). Safe to paste twice: every column is ADD … IF NOT EXISTS, tables are CREATE … IF NOT
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

-- 0. Preflight ----------------------------------------------------------------
-- This database has drifted from the migration files (columns from migration
-- 011 are missing in production). Rather than fail on the first missing
-- column, check everything this migration and the rebuilt Advance code rely
-- on, and stop BEFORE changing anything, naming every gap at once.
DO $$
DECLARE
  need text[] := ARRAY[
    'public.workspaces.id',
    'public.tours.id', 'public.tours.workspace_id',
    'public.routing.id',
    'auth.users.id',
    'public.advance_layout_templates.id', 'public.advance_layout_templates.workspace_id',
    'public.advance_layout_templates.name', 'public.advance_layout_templates.sections',
    'public.advance_form_configs.id', 'public.advance_form_configs.tour_id',
    'public.advance_form_configs.routing_id', 'public.advance_form_configs.name',
    'public.advance_form_configs.sections',
    'public.advance_instances.id', 'public.advance_instances.routing_id',
    'public.advance_instances.form_config_id', 'public.advance_instances.status',
    'public.advance_instances.data', 'public.advance_instances.last_updated_at',
    'public.advance_instances.last_updated_by_id',
    'public.advance_intake_links.id', 'public.advance_intake_links.token',
    'public.advance_intake_links.tour_id', 'public.advance_intake_links.routing_id',
    'public.advance_intake_links.advance_instance_id', 'public.advance_intake_links.status',
    'public.advance_intake_links.created_at', 'public.advance_intake_links.revoked_at',
    'public.advance_intake_links.expires_at', 'public.advance_intake_links.submitted_at',
    'public.advance_intake_links.last_viewed_at',
    'public.advance_intake_links.recipient_name', 'public.advance_intake_links.recipient_email',
    'public.advance_templates.id', 'public.advance_templates.tm_only',
    'public.intake_pending_answers.id', 'public.intake_pending_answers.workspace_id',
    'public.intake_pending_answers.advance_instance_id', 'public.intake_pending_answers.section_id',
    'public.intake_pending_answers.field_id', 'public.intake_pending_answers.value',
    'public.intake_pending_answers.status'
  ];
  missing text[] := '{}';
  item text;
  parts text[];
BEGIN
  FOREACH item IN ARRAY need LOOP
    parts := string_to_array(item, '.');
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = parts[1] AND table_name = parts[2] AND column_name = parts[3]
    ) THEN
      missing := missing || item;
    END IF;
  END LOOP;
  IF to_regprocedure('public.get_my_workspace_id()') IS NULL THEN
    missing := missing || 'function public.get_my_workspace_id()'::text;
  END IF;
  IF coalesce(array_length(missing, 1), 0) > 0 THEN
    RAISE EXCEPTION '276 stopped before changing anything. Missing: %', array_to_string(missing, ', ')
      USING HINT = 'Send this list back to Claude. Nothing was applied.';
  END IF;
END $$;

-- 1. Workspace templates ------------------------------------------------------
ALTER TABLE public.advance_layout_templates ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.advance_layout_templates ADD COLUMN IF NOT EXISTS source_config_id uuid;

-- Copy old per-tour templates in. Written against whatever columns this
-- database actually has: is_template / template_label come from migration 011,
-- which isn't applied everywhere (no is_template → there are no old templates
-- to copy; no template_label → the config's name is used).
DO $$
DECLARE
  has_flag  boolean;
  has_label boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'advance_form_configs' AND column_name = 'is_template')
    INTO has_flag;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'advance_form_configs' AND column_name = 'template_label')
    INTO has_label;
  IF NOT has_flag THEN
    RAISE NOTICE '276: advance_form_configs.is_template is absent, so there are no old templates to copy';
    RETURN;
  END IF;
  EXECUTE format($q$
    INSERT INTO public.advance_layout_templates (workspace_id, name, sections, source_config_id)
    SELECT t.workspace_id,
           COALESCE(%s NULLIF(trim(c.name), ''), 'Untitled template'),
           COALESCE(c.sections, '[]'::jsonb),
           c.id
    FROM public.advance_form_configs c
    JOIN public.tours t ON t.id = c.tour_id
    WHERE c.is_template = true
      AND t.workspace_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.advance_layout_templates l WHERE l.source_config_id = c.id)
  $q$, CASE WHEN has_label THEN 'NULLIF(trim(c.template_label), ''''),' ELSE '' END);
END $$;

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
