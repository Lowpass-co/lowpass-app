-- Migration 111 — Rider Architecture Mirror (§RA1)
--
-- Substrate for the Advance-pattern rider editor:
--   1. rider_section_templates — the section template library
--      (mirrors advance_templates: workspace_id NULL = platform
--      template visible to all workspaces; workspace forks via
--      forked_from_id).
--   2. rider_sections gains status + last_updated_by_id (section
--      completion tracking) + template_id (linkage to the library).
--   3. Platform-level section template seeds (Contacts first, locked).
--
-- Number 111: main tops at 108; feat/stage-plot-builder holds 109+110.
-- Idempotent (IF NOT EXISTS / DROP-then-CREATE policy / guarded seed).

-- ============================================================
-- 1. Section template library
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rider_section_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_type   text NOT NULL,
  name            text NOT NULL,
  description     text,
  icon            text,
  fields          jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_for   text[],
  forked_from_id  uuid REFERENCES public.rider_section_templates(id) ON DELETE SET NULL,
  sort_order      integer NOT NULL DEFAULT 100,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rst_fields_is_array CHECK (jsonb_typeof(fields) = 'array')
);

CREATE INDEX IF NOT EXISTS rst_workspace_idx ON public.rider_section_templates(workspace_id);
CREATE INDEX IF NOT EXISTS rst_type_idx ON public.rider_section_templates(template_type, sort_order);
CREATE INDEX IF NOT EXISTS rst_forked_from_idx ON public.rider_section_templates(forked_from_id) WHERE forked_from_id IS NOT NULL;
-- One platform template per template_type (keeps the seed idempotent + the
-- library deduped). Workspace forks are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS rst_platform_type_uniq ON public.rider_section_templates(template_type) WHERE workspace_id IS NULL;

ALTER TABLE public.rider_section_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rst_select ON public.rider_section_templates;
CREATE POLICY rst_select ON public.rider_section_templates FOR SELECT
  USING (workspace_id IS NULL OR workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS rst_insert ON public.rider_section_templates;
CREATE POLICY rst_insert ON public.rider_section_templates FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS rst_update ON public.rider_section_templates;
CREATE POLICY rst_update ON public.rider_section_templates FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS rst_delete ON public.rider_section_templates;
CREATE POLICY rst_delete ON public.rider_section_templates FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- ============================================================
-- 2. rider_sections — completion tracking + template linkage
-- ============================================================
ALTER TABLE public.rider_sections
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','complete','needs_review'));
ALTER TABLE public.rider_sections
  ADD COLUMN IF NOT EXISTS last_updated_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.rider_sections
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.rider_section_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rider_sections_template_idx ON public.rider_sections(template_id) WHERE template_id IS NOT NULL;

-- ============================================================
-- 3. Platform-level section template seeds (Contacts FIRST)
--    Guarded so re-runs don't duplicate.
-- ============================================================
DO $seed$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rider_section_templates WHERE workspace_id IS NULL) THEN
    INSERT INTO public.rider_section_templates
      (workspace_id, template_type, name, description, icon, fields, sort_order)
    VALUES
      (NULL, 'contacts', 'Contacts', 'Key contacts: TM, PM, FOH, Mons, Management', 'users',
       '[{"id":"tm","label":"Tour Manager","type":"contact","required":true},{"id":"pm","label":"Production Manager","type":"contact"},{"id":"foh","label":"FOH Engineer","type":"contact"},{"id":"mons","label":"Monitor Engineer","type":"contact"},{"id":"management","label":"Management","type":"contact"}]'::jsonb, 10),
      (NULL, 'schedule', 'Schedule', 'Load-in, soundcheck, doors, set times, curfew', 'clock',
       '[{"id":"load_in","label":"Load-in","type":"time"},{"id":"soundcheck","label":"Soundcheck","type":"time"},{"id":"doors","label":"Doors","type":"time"},{"id":"set_time","label":"Set time","type":"time"},{"id":"curfew","label":"Curfew","type":"time"}]'::jsonb, 20),
      (NULL, 'audio', 'Audio / FOH', 'Audio system, mic count, console requirements', 'mic',
       '[{"id":"pa","label":"PA system","type":"textarea"},{"id":"foh_console","label":"FOH console","type":"text"},{"id":"monitor_console","label":"Monitor console","type":"text"},{"id":"channel_count","label":"Channel count","type":"number"}]'::jsonb, 30),
      (NULL, 'monitoring', 'Monitors / IEMs', 'IEM packs, wedge count, RF spectrum', 'headphones',
       '[{"id":"iem_pack_count","label":"IEM packs","type":"number"},{"id":"wedge_count","label":"Wedge count","type":"number"},{"id":"rf_notes","label":"RF coordination","type":"textarea"}]'::jsonb, 40),
      (NULL, 'lighting', 'Lighting', 'Console, fixture types, backdrop', 'lightbulb',
       '[{"id":"console","label":"Console","type":"text"},{"id":"fixtures","label":"Fixtures","type":"textarea"},{"id":"backdrop","label":"Backdrop","type":"textarea"}]'::jsonb, 50),
      (NULL, 'backline', 'Backline', 'Drums, amps, keyboards needed from venue', 'guitar',
       '[{"id":"drums","label":"Drum kit","type":"textarea"},{"id":"guitar_amps","label":"Guitar amps","type":"textarea"},{"id":"bass_amps","label":"Bass amps","type":"textarea"},{"id":"keys","label":"Keys / pianos","type":"textarea"}]'::jsonb, 60),
      (NULL, 'risers', 'Risers / Stage', 'Riser dimensions, stage size, special needs', 'square',
       '[{"id":"riser_sizes","label":"Risers required","type":"textarea"},{"id":"stage_minimum","label":"Minimum stage size","type":"text"}]'::jsonb, 70),
      (NULL, 'security', 'Security', 'Bag policy, metal detection, walkthrough', 'shield',
       '[{"id":"metal_detection","label":"Metal detection","type":"boolean"},{"id":"bag_policy","label":"Bag policy","type":"textarea"},{"id":"walkthrough_required","label":"Walkthrough required","type":"boolean"}]'::jsonb, 80),
      (NULL, 'hospitality', 'Hospitality', 'Dressing rooms, towels, snacks, water', 'coffee',
       '[{"id":"dressing_rooms","label":"Dressing rooms","type":"textarea"},{"id":"towels_shower","label":"Shower towels","type":"number"},{"id":"towels_stage","label":"Stage towels","type":"number"},{"id":"snacks","label":"Snacks","type":"textarea"}]'::jsonb, 90),
      (NULL, 'catering', 'Catering', 'Meals, dietary needs, alcohol policy', 'utensils',
       '[{"id":"meal_count","label":"Meal count","type":"number"},{"id":"dietary","label":"Dietary requirements","type":"textarea"},{"id":"alcohol","label":"Alcohol policy","type":"textarea"}]'::jsonb, 100),
      (NULL, 'transport', 'Transportation', 'Vehicles, parking, load-in details', 'truck',
       '[{"id":"vehicles","label":"Vehicles","type":"text"},{"id":"parking","label":"Parking instructions","type":"textarea"},{"id":"load_in_notes","label":"Load-in notes","type":"textarea"}]'::jsonb, 110),
      (NULL, 'labour', 'Labour / Crew', 'Stagehands, FOH, lighting, monitor tech', 'users-2',
       '[{"id":"stagehands","label":"Stagehands","type":"number"},{"id":"all_day","label":"All-day crew","type":"number"},{"id":"foh_tech","label":"FOH tech","type":"boolean"},{"id":"lx_tech","label":"Lighting tech","type":"boolean"},{"id":"mon_tech","label":"Monitor / stage tech","type":"boolean"}]'::jsonb, 120),
      (NULL, 'merch', 'Merchandise', 'Merch company, location, splits', 'shopping-bag',
       '[{"id":"merch_company","label":"Merch company","type":"text"},{"id":"location","label":"Location","type":"text"},{"id":"split","label":"Split %","type":"number"}]'::jsonb, 130);
  END IF;
END
$seed$;

-- ============================================================
-- Down (manual):
--   ALTER TABLE public.rider_sections DROP COLUMN IF EXISTS template_id;
--   ALTER TABLE public.rider_sections DROP COLUMN IF EXISTS last_updated_by_id;
--   ALTER TABLE public.rider_sections DROP COLUMN IF EXISTS status;
--   DROP TABLE IF EXISTS public.rider_section_templates;
-- ============================================================
