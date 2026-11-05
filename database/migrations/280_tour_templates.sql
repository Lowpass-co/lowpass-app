-- ============================================
-- LOWPASS — Tour templates: budget by scale + advance per tour
-- Migration 280
-- ============================================
--
-- What a new tour starts from (Nov 2026, Adam). Source of truth for the
-- lists below is src/lib/templates/tourTemplates.ts — this file is generated
-- from it and pinned to it by src/lib/templates/tourTemplates.test.tsx.
--
-- 1. BUDGET — six system templates by scale of tour, built from the skeleton
--    of Adam's own Sheets budgets: Support tour · Club · Theatre · Arena ·
--    Stadium · Press tour. Salaries, Per Diems and Hotels are seeded as EMPTY
--    sections: their lines are written automatically from Payroll and Hotels
--    (reconcileDerivedBudgetLines), so the template only gives them a home.
--    Deterministic ids exactly like migration 200 ('lp_sys_template:<name>' …).
--
-- 2. RETIRE the three generic presets from migration 200 ('Club / Support
--    run', 'Headline tour', 'Festival run'). Retired, not deleted: their rows
--    stay (budget_templates.retired_at is set) and the template picker hides
--    them. Nothing references a template after it has been applied.
--
-- 3. ADVANCE PER TOUR — tour_advance_day_templates: a tour's own choice of
--    advance template per day type (show / festival / off). Overrides the
--    workspace's advance_day_type_templates for that tour only.
--
-- HAND-PASTE: pasted by hand into the Supabase SQL editor. Re-runnable: every
-- insert is ON CONFLICT DO NOTHING, every update is guarded, every policy is
-- dropped before it is created. Depends on 200 (budget_templates) and 276
-- (advance_layout_templates).
-- ============================================

-- --------------------------------------------
-- 1. Columns the picker needs
-- --------------------------------------------
ALTER TABLE public.budget_templates ADD COLUMN IF NOT EXISTS retired_at timestamptz;
ALTER TABLE public.budget_templates ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

-- --------------------------------------------
-- 2. Retire the generic presets
-- --------------------------------------------
UPDATE public.budget_templates
   SET retired_at = now()
 WHERE is_system
   AND workspace_id IS NULL
   AND name IN ('Club / Support run', 'Headline tour', 'Festival run')
   AND retired_at IS NULL;

-- --------------------------------------------
-- 3. The six templates
-- --------------------------------------------
INSERT INTO public.budget_templates
  (id, workspace_id, artist_id, name, description, tier, is_system, is_default, sort_order)
SELECT md5('lp_sys_template:' || t.name)::uuid, NULL, NULL, t.name, t.description, t.tier, true, false, t.sort_order
FROM (
  VALUES
    ('Support tour', 'support', 'Opening for another artist. Van or splitter, a small crew.', 0),
    ('Club', 'club', 'Headlining clubs, up to about 1,000 cap. Van and trailer, TM/FOH and merch.', 1),
    ('Theatre', 'theatre', 'Theatres and big rooms, 1,000–5,000. Sleeper bus or van, a small crew, a floor lighting package.', 2),
    ('Arena', 'arena', 'Arenas, 5,000–20,000. Buses and trucks, full production.', 3),
    ('Stadium', 'stadium', 'Stadiums and major outdoor shows. Fleets of buses and trucks, steel, video, sea and air freight.', 4),
    ('Press tour', 'press', 'Promo, radio and TV days. Travel, hotels and glam — no production.', 5)
) AS t(name, tier, description, sort_order)
ON CONFLICT (id) DO NOTHING;

-- Keep wording / order current on a re-paste after an edit to the list.
UPDATE public.budget_templates b
   SET description = t.description, tier = t.tier, sort_order = t.sort_order, retired_at = NULL
  FROM (
  VALUES
    ('Support tour', 'support', 'Opening for another artist. Van or splitter, a small crew.', 0),
    ('Club', 'club', 'Headlining clubs, up to about 1,000 cap. Van and trailer, TM/FOH and merch.', 1),
    ('Theatre', 'theatre', 'Theatres and big rooms, 1,000–5,000. Sleeper bus or van, a small crew, a floor lighting package.', 2),
    ('Arena', 'arena', 'Arenas, 5,000–20,000. Buses and trucks, full production.', 3),
    ('Stadium', 'stadium', 'Stadiums and major outdoor shows. Fleets of buses and trucks, steel, video, sea and air freight.', 4),
    ('Press tour', 'press', 'Promo, radio and TV days. Travel, hotels and glam — no production.', 5)
) AS t(name, tier, description, sort_order)
 WHERE b.id = md5('lp_sys_template:' || t.name)::uuid
   AND (b.description IS DISTINCT FROM t.description OR b.tier IS DISTINCT FROM t.tier
        OR b.sort_order IS DISTINCT FROM t.sort_order OR b.retired_at IS NOT NULL);

INSERT INTO public.budget_template_sections (id, template_id, workspace_id, name, sort_order)
SELECT
  md5('lp_sys_section:' || s.template_name || '|' || s.name)::uuid,
  md5('lp_sys_template:' || s.template_name)::uuid,
  NULL::uuid,
  s.name,
  s.sort_order
FROM (
  VALUES
    ('Support tour', 'Salaries', 0),
    ('Support tour', 'Per Diems', 1),
    ('Support tour', 'Hotels', 2),
    ('Support tour', 'Transport', 3),
    ('Support tour', 'Production', 4),
    ('Club', 'Salaries', 0),
    ('Club', 'Per Diems', 1),
    ('Club', 'Hotels', 2),
    ('Club', 'Transport', 3),
    ('Club', 'Production', 4),
    ('Theatre', 'Salaries', 0),
    ('Theatre', 'Per Diems', 1),
    ('Theatre', 'Hotels', 2),
    ('Theatre', 'Transport', 3),
    ('Theatre', 'Production', 4),
    ('Arena', 'Salaries', 0),
    ('Arena', 'Per Diems', 1),
    ('Arena', 'Hotels', 2),
    ('Arena', 'Transport', 3),
    ('Arena', 'Production', 4),
    ('Stadium', 'Salaries', 0),
    ('Stadium', 'Per Diems', 1),
    ('Stadium', 'Hotels', 2),
    ('Stadium', 'Transport', 3),
    ('Stadium', 'Production', 4),
    ('Press tour', 'Salaries', 0),
    ('Press tour', 'Per Diems', 1),
    ('Press tour', 'Hotels', 2),
    ('Press tour', 'Transport', 3),
    ('Press tour', 'Press & promo', 4)
) AS s(template_name, name, sort_order)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.budget_template_lines
  (id, template_id, template_section_id, workspace_id, label, default_phase_tag, sort_order)
SELECT
  md5('lp_sys_line:' || l.template_name || '|' || l.section_name || '|' || l.label)::uuid,
  md5('lp_sys_template:' || l.template_name)::uuid,
  md5('lp_sys_section:' || l.template_name || '|' || l.section_name)::uuid,
  NULL::uuid,
  l.label,
  NULL,
  l.sort_order
FROM (
  VALUES
    ('Support tour', 'Transport', 'Van hire', 0),
    ('Support tour', 'Transport', 'Fuel', 1),
    ('Support tour', 'Transport', 'Parking', 2),
    ('Support tour', 'Transport', 'Tolls & vignettes', 3),
    ('Support tour', 'Transport', 'Ferries & crossings', 4),
    ('Support tour', 'Transport', 'Taxis', 5),
    ('Support tour', 'Transport', 'Travel agent', 6),
    ('Support tour', 'Production', 'Backline hire', 0),
    ('Support tour', 'Production', 'Equipment & consumables', 1),
    ('Support tour', 'Production', 'Freight & excess baggage', 2),
    ('Support tour', 'Production', 'Misc', 3),
    ('Club', 'Transport', 'Van & trailer hire', 0),
    ('Club', 'Transport', 'Fuel', 1),
    ('Club', 'Transport', 'Parking', 2),
    ('Club', 'Transport', 'Tolls & vignettes', 3),
    ('Club', 'Transport', 'Ferries & crossings', 4),
    ('Club', 'Transport', 'Taxis', 5),
    ('Club', 'Transport', 'Travel agent', 6),
    ('Club', 'Production', 'Audio & backline hire', 0),
    ('Club', 'Production', 'Equipment & consumables', 1),
    ('Club', 'Production', 'Freight & excess baggage', 2),
    ('Club', 'Production', 'Set & wardrobe', 3),
    ('Club', 'Production', 'Misc', 4),
    ('Theatre', 'Transport', 'Bus', 0),
    ('Theatre', 'Transport', 'Trailer', 1),
    ('Theatre', 'Transport', 'Fuel', 2),
    ('Theatre', 'Transport', 'Parking', 3),
    ('Theatre', 'Transport', 'Taxis', 4),
    ('Theatre', 'Transport', 'Misc transport', 5),
    ('Theatre', 'Transport', 'Travel agent', 6),
    ('Theatre', 'Production', 'Audio & backline hire', 0),
    ('Theatre', 'Production', 'Lighting hire', 1),
    ('Theatre', 'Production', 'Programming + set-up', 2),
    ('Theatre', 'Production', 'Freight, cartage & baggage', 3),
    ('Theatre', 'Production', 'Equipment purchase', 4),
    ('Theatre', 'Production', 'Set & wardrobe', 5),
    ('Theatre', 'Production', 'Production rehearsals', 6),
    ('Theatre', 'Production', 'Misc', 7),
    ('Arena', 'Transport', 'Buses', 0),
    ('Arena', 'Transport', 'Trucking', 1),
    ('Arena', 'Transport', 'Fuel', 2),
    ('Arena', 'Transport', 'Parking', 3),
    ('Arena', 'Transport', 'Taxis & ground transport', 4),
    ('Arena', 'Transport', 'Misc transport', 5),
    ('Arena', 'Transport', 'Travel agent', 6),
    ('Arena', 'Production', 'Audio hire', 0),
    ('Arena', 'Production', 'Lighting hire', 1),
    ('Arena', 'Production', 'Video hire', 2),
    ('Arena', 'Production', 'Backline hire', 3),
    ('Arena', 'Production', 'Rigging & motors', 4),
    ('Arena', 'Production', 'Set & staging', 5),
    ('Arena', 'Production', 'SFX & pyro', 6),
    ('Arena', 'Production', 'Programming + set-up', 7),
    ('Arena', 'Production', 'Production rehearsals', 8),
    ('Arena', 'Production', 'Freight & shipping', 9),
    ('Arena', 'Production', 'Carnets & customs', 10),
    ('Arena', 'Production', 'Tour catering', 11),
    ('Arena', 'Production', 'Equipment purchase', 12),
    ('Arena', 'Production', 'Wardrobe', 13),
    ('Arena', 'Production', 'Misc', 14),
    ('Stadium', 'Transport', 'Buses', 0),
    ('Stadium', 'Transport', 'Trucking', 1),
    ('Stadium', 'Transport', 'Charter flights', 2),
    ('Stadium', 'Transport', 'Fuel', 3),
    ('Stadium', 'Transport', 'Parking', 4),
    ('Stadium', 'Transport', 'Taxis & ground transport', 5),
    ('Stadium', 'Transport', 'Misc transport', 6),
    ('Stadium', 'Transport', 'Travel agent', 7),
    ('Stadium', 'Production', 'Audio hire', 0),
    ('Stadium', 'Production', 'Lighting hire', 1),
    ('Stadium', 'Production', 'Video & screens', 2),
    ('Stadium', 'Production', 'Backline hire', 3),
    ('Stadium', 'Production', 'Rigging & motors', 4),
    ('Stadium', 'Production', 'Set & staging', 5),
    ('Stadium', 'Production', 'Steel & stage system', 6),
    ('Stadium', 'Production', 'SFX & pyro', 7),
    ('Stadium', 'Production', 'Programming + set-up', 8),
    ('Stadium', 'Production', 'Production rehearsals', 9),
    ('Stadium', 'Production', 'Sea & air freight', 10),
    ('Stadium', 'Production', 'Carnets & customs', 11),
    ('Stadium', 'Production', 'Tour catering', 12),
    ('Stadium', 'Production', 'Security', 13),
    ('Stadium', 'Production', 'Advance & site visits', 14),
    ('Stadium', 'Production', 'Equipment purchase', 15),
    ('Stadium', 'Production', 'Wardrobe', 16),
    ('Stadium', 'Production', 'Misc', 17),
    ('Press tour', 'Transport', 'Trains', 0),
    ('Press tour', 'Transport', 'Cars & drivers', 1),
    ('Press tour', 'Transport', 'Taxis', 2),
    ('Press tour', 'Transport', 'Travel agent', 3),
    ('Press tour', 'Press & promo', 'Hair & makeup', 0),
    ('Press tour', 'Press & promo', 'Styling & wardrobe', 1),
    ('Press tour', 'Press & promo', 'Content & photography', 2),
    ('Press tour', 'Press & promo', 'Rehearsal / performance space', 3),
    ('Press tour', 'Press & promo', 'Gifts & hospitality', 4),
    ('Press tour', 'Press & promo', 'Misc', 5)
) AS l(template_name, section_name, label, sort_order)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------
-- 4. A tour's own advance template per day type
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.tour_advance_day_templates (
  tour_id            uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  day_type           text NOT NULL,
  layout_template_id uuid NOT NULL REFERENCES public.advance_layout_templates(id) ON DELETE CASCADE,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tour_id, day_type)
);
CREATE INDEX IF NOT EXISTS idx_tour_advance_day_templates_template
  ON public.tour_advance_day_templates (layout_template_id);
ALTER TABLE public.tour_advance_day_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tour_advance_day_templates_select ON public.tour_advance_day_templates;
CREATE POLICY tour_advance_day_templates_select ON public.tour_advance_day_templates
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS tour_advance_day_templates_insert ON public.tour_advance_day_templates;
CREATE POLICY tour_advance_day_templates_insert ON public.tour_advance_day_templates
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND EXISTS (SELECT 1 FROM public.tours t WHERE t.id = tour_id AND t.workspace_id = public.get_my_workspace_id())
    AND EXISTS (SELECT 1 FROM public.advance_layout_templates l WHERE l.id = layout_template_id AND l.workspace_id = public.get_my_workspace_id())
  );
DROP POLICY IF EXISTS tour_advance_day_templates_update ON public.tour_advance_day_templates;
CREATE POLICY tour_advance_day_templates_update ON public.tour_advance_day_templates
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND EXISTS (SELECT 1 FROM public.tours t WHERE t.id = tour_id AND t.workspace_id = public.get_my_workspace_id())
    AND EXISTS (SELECT 1 FROM public.advance_layout_templates l WHERE l.id = layout_template_id AND l.workspace_id = public.get_my_workspace_id())
  );
DROP POLICY IF EXISTS tour_advance_day_templates_delete ON public.tour_advance_day_templates;
CREATE POLICY tour_advance_day_templates_delete ON public.tour_advance_day_templates
  FOR DELETE USING (workspace_id = public.get_my_workspace_id());

-- --------------------------------------------
-- Check (expect: 6 live system templates, 3 retired, the new table present):
-- SELECT name, retired_at IS NOT NULL AS retired FROM public.budget_templates WHERE is_system ORDER BY retired, sort_order, name;
-- SELECT to_regclass('public.tour_advance_day_templates');
-- --------------------------------------------

-- ============================================
-- DOWN (manual):
-- DROP TABLE IF EXISTS public.tour_advance_day_templates;
-- DELETE FROM public.budget_templates WHERE is_system AND workspace_id IS NULL
--   AND name IN ('Support tour', 'Club', 'Theatre', 'Arena', 'Stadium', 'Press tour');   -- cascades sections + lines
-- UPDATE public.budget_templates SET retired_at = NULL WHERE is_system AND name IN ('Club / Support run', 'Headline tour', 'Festival run');
-- ALTER TABLE public.budget_templates DROP COLUMN IF EXISTS sort_order;
-- ALTER TABLE public.budget_templates DROP COLUMN IF EXISTS retired_at;
-- ============================================
