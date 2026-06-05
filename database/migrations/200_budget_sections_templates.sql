-- ============================================
-- LOWPASS — Budget sections + templates (Budget redesign Phase A)
-- Migration 200
-- ============================================
--
-- Clean-break numbering: the highest existing migration on this branch
-- is 113. Per the Budget-redesign spec we deliberately jump to 200 to
-- reserve 114–199 for in-flight sibling work and to give the budget
-- redesign its own contiguous block (200+). Intentional gap — see
-- database/migrations/README.md numbering rule #2.
--
-- What this migration introduces:
--   1. budget_sections          — per-tour, user-defined section headers
--                                 (the new backbone of a budget).
--   2. budget_templates         — system presets (workspace_id NULL,
--                                 is_system) + workspace/artist templates.
--   3. budget_template_sections — a template's section headers.
--   4. budget_template_lines    — a template's default line labels.
--   5. budget_line_items.section_id  — supersedes the legacy
--                                 `section` enum + `category` string in
--                                 the UI. Old columns kept for back-compat.
--   6. budget_settings.track_phases  — per-tour phase toggle (default off).
--
-- Then it seeds three global system templates (§4 of the spec) and
-- backfills budget_sections from each tour's existing DISTINCT category
-- values so current budgets keep rendering after the grid repoints at
-- section_id.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING / guarded backfill).
-- RLS via public.get_my_workspace_id(). Down-migration block at the end.
-- ============================================

-- --------------------------------------------
-- 1. budget_sections — per-tour section headers
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id      UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_sections_tour
  ON public.budget_sections (tour_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_budget_sections_workspace
  ON public.budget_sections (workspace_id);

ALTER TABLE public.budget_sections ENABLE ROW LEVEL SECURITY;

-- Plain workspace-scoped 4-policy set — mirrors budget_line_items'
-- base RLS so sections are editable by anyone in the workspace (the
-- Phase D section editor relies on this). DROP+CREATE for re-run safety.
DROP POLICY IF EXISTS budget_sections_select ON public.budget_sections;
CREATE POLICY budget_sections_select ON public.budget_sections
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_sections_insert ON public.budget_sections;
CREATE POLICY budget_sections_insert ON public.budget_sections
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_sections_update ON public.budget_sections;
CREATE POLICY budget_sections_update ON public.budget_sections
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_sections_delete ON public.budget_sections;
CREATE POLICY budget_sections_delete ON public.budget_sections
  FOR DELETE USING (workspace_id = public.get_my_workspace_id());

-- --------------------------------------------
-- 2. budget_templates — system + workspace presets
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE, -- NULL = global system preset
  artist_id    UUID REFERENCES public.artists(id) ON DELETE CASCADE,    -- set = per-artist override
  name         TEXT NOT NULL,
  description  TEXT,
  tier         TEXT,                                                     -- 'club' | 'headline' | 'festival' | ...
  is_system    BOOLEAN NOT NULL DEFAULT false,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_templates_workspace
  ON public.budget_templates (workspace_id);
CREATE INDEX IF NOT EXISTS idx_budget_templates_artist
  ON public.budget_templates (artist_id);

-- Stable natural key for system presets so the seed below (and the
-- Phase B API) can upsert by name without duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS budget_templates_system_name_key
  ON public.budget_templates (name) WHERE is_system;

ALTER TABLE public.budget_templates ENABLE ROW LEVEL SECURITY;

-- System rows (workspace_id NULL) are readable by everyone; workspace
-- rows are scoped. Writes are workspace-scoped only — users cannot
-- create or mutate system presets (those are seeded by this migration,
-- which runs with RLS-bypassing service-role creds).
DROP POLICY IF EXISTS budget_templates_select ON public.budget_templates;
CREATE POLICY budget_templates_select ON public.budget_templates
  FOR SELECT USING (
    workspace_id IS NULL OR workspace_id = public.get_my_workspace_id()
  );

DROP POLICY IF EXISTS budget_templates_insert ON public.budget_templates;
CREATE POLICY budget_templates_insert ON public.budget_templates
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_templates_update ON public.budget_templates;
CREATE POLICY budget_templates_update ON public.budget_templates
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_templates_delete ON public.budget_templates;
CREATE POLICY budget_templates_delete ON public.budget_templates
  FOR DELETE USING (workspace_id = public.get_my_workspace_id());

-- --------------------------------------------
-- 3. budget_template_sections
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_template_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES public.budget_templates(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE, -- NULL for system
  name         TEXT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_budget_template_sections_template
  ON public.budget_template_sections (template_id, sort_order);

ALTER TABLE public.budget_template_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_template_sections_select ON public.budget_template_sections;
CREATE POLICY budget_template_sections_select ON public.budget_template_sections
  FOR SELECT USING (
    workspace_id IS NULL OR workspace_id = public.get_my_workspace_id()
  );

DROP POLICY IF EXISTS budget_template_sections_insert ON public.budget_template_sections;
CREATE POLICY budget_template_sections_insert ON public.budget_template_sections
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_template_sections_update ON public.budget_template_sections;
CREATE POLICY budget_template_sections_update ON public.budget_template_sections
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_template_sections_delete ON public.budget_template_sections;
CREATE POLICY budget_template_sections_delete ON public.budget_template_sections
  FOR DELETE USING (workspace_id = public.get_my_workspace_id());

-- --------------------------------------------
-- 4. budget_template_lines
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_template_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES public.budget_templates(id) ON DELETE CASCADE,
  template_section_id UUID NOT NULL REFERENCES public.budget_template_sections(id) ON DELETE CASCADE,
  workspace_id        UUID REFERENCES public.workspaces(id) ON DELETE CASCADE, -- NULL for system
  label               TEXT NOT NULL,
  default_phase_tag   TEXT,
  sort_order          INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_budget_template_lines_template
  ON public.budget_template_lines (template_id);
CREATE INDEX IF NOT EXISTS idx_budget_template_lines_section
  ON public.budget_template_lines (template_section_id, sort_order);

ALTER TABLE public.budget_template_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_template_lines_select ON public.budget_template_lines;
CREATE POLICY budget_template_lines_select ON public.budget_template_lines
  FOR SELECT USING (
    workspace_id IS NULL OR workspace_id = public.get_my_workspace_id()
  );

DROP POLICY IF EXISTS budget_template_lines_insert ON public.budget_template_lines;
CREATE POLICY budget_template_lines_insert ON public.budget_template_lines
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_template_lines_update ON public.budget_template_lines;
CREATE POLICY budget_template_lines_update ON public.budget_template_lines
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_template_lines_delete ON public.budget_template_lines;
CREATE POLICY budget_template_lines_delete ON public.budget_template_lines
  FOR DELETE USING (workspace_id = public.get_my_workspace_id());

-- --------------------------------------------
-- 5. Column additions on existing tables
--    (legacy `section` enum + `category` string left untouched for
--     back-compat; section_id supersedes them in the UI)
-- --------------------------------------------
ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS section_id UUID
    REFERENCES public.budget_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budget_line_items_section_id
  ON public.budget_line_items (section_id);

ALTER TABLE public.budget_settings
  ADD COLUMN IF NOT EXISTS track_phases BOOLEAN NOT NULL DEFAULT false;

-- --------------------------------------------
-- 6. Seed system templates (§4)
--    Deterministic md5-derived UUIDs keyed off the natural names give
--    stable PKs + cross-references, so the whole seed is idempotent via
--    ON CONFLICT (id) DO NOTHING and safe to re-run.
-- --------------------------------------------
INSERT INTO public.budget_templates
  (id, workspace_id, artist_id, name, description, tier, is_system, is_default)
VALUES
  (md5('lp_sys_template:Club / Support run')::uuid, NULL, NULL,
   'Club / Support run', 'Lean budget for club shows and support runs.', 'club', true, false),
  (md5('lp_sys_template:Headline tour')::uuid, NULL, NULL,
   'Headline tour', 'Mid-scale headline touring budget.', 'headline', true, false),
  (md5('lp_sys_template:Festival run')::uuid, NULL, NULL,
   'Festival run', 'Full-scale festival / production touring budget (Good Neighbours model).', 'festival', true, false)
ON CONFLICT (id) DO NOTHING;

-- Sections per template (id derived from template name + section name).
INSERT INTO public.budget_template_sections (id, template_id, workspace_id, name, sort_order)
SELECT
  md5('lp_sys_section:' || s.template_name || '|' || s.name)::uuid,
  md5('lp_sys_template:' || s.template_name)::uuid,
  NULL::uuid,
  s.name,
  s.sort_order
FROM (
  VALUES
    -- Club / Support run
    ('Club / Support run', 'Travel',        0),
    ('Club / Support run', 'Accommodation', 1),
    ('Club / Support run', 'Per Diems',     2),
    ('Club / Support run', 'Production',    3),
    ('Club / Support run', 'Contingency',   4),
    -- Headline tour
    ('Headline tour', 'Salaries',      0),
    ('Headline tour', 'Per Diems',     1),
    ('Headline tour', 'Travel',        2),
    ('Headline tour', 'Accommodation', 3),
    ('Headline tour', 'Production',    4),
    ('Headline tour', 'Marketing',     5),
    ('Headline tour', 'Commissions',   6),
    ('Headline tour', 'Insurance',     7),
    ('Headline tour', 'Contingency',   8),
    -- Festival run
    ('Festival run', 'Salaries',          0),
    ('Festival run', 'Per Diem',          1),
    ('Festival run', 'Hotel',             2),
    ('Festival run', 'Transport',         3),
    ('Festival run', 'Production + Misc',  4),
    ('Festival run', 'Commissions',       5),
    ('Festival run', 'Insurance',         6),
    ('Festival run', 'Contingency',       7)
) AS s(template_name, name, sort_order)
ON CONFLICT (id) DO NOTHING;

-- Default line labels per section.
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
    -- ---- Club / Support run ----
    ('Club / Support run', 'Travel',        'Flights',           0),
    ('Club / Support run', 'Travel',        'Ground transport',  1),
    ('Club / Support run', 'Travel',        'Baggage',           2),
    ('Club / Support run', 'Accommodation', 'Hotels',            0),
    ('Club / Support run', 'Per Diems',     'Per diems',         0),
    ('Club / Support run', 'Production',    'Backline hire',     0),
    ('Club / Support run', 'Production',    'Misc',              1),
    ('Club / Support run', 'Contingency',   'Contingency',       0),
    -- ---- Headline tour ----
    ('Headline tour', 'Salaries',      'Band salaries',           0),
    ('Headline tour', 'Salaries',      'Crew salaries',           1),
    ('Headline tour', 'Per Diems',     'Per diems',               0),
    ('Headline tour', 'Travel',        'Flights',                 0),
    ('Headline tour', 'Travel',        'Bus / truck',             1),
    ('Headline tour', 'Travel',        'Taxis',                   2),
    ('Headline tour', 'Travel',        'Fuel',                    3),
    ('Headline tour', 'Travel',        'Parking',                 4),
    ('Headline tour', 'Travel',        'Travel agent',            5),
    ('Headline tour', 'Accommodation', 'Hotels',                  0),
    ('Headline tour', 'Production',    'Audio & backline hire',   0),
    ('Headline tour', 'Production',    'Lighting hire',           1),
    ('Headline tour', 'Production',    'Freight / cartage',       2),
    ('Headline tour', 'Production',    'Programming',             3),
    ('Headline tour', 'Production',    'Misc',                    4),
    ('Headline tour', 'Marketing',     'Marketing',               0),
    ('Headline tour', 'Commissions',   'Agency',                  0),
    ('Headline tour', 'Commissions',   'Management',              1),
    ('Headline tour', 'Insurance',     'Insurance',               0),
    ('Headline tour', 'Contingency',   'Contingency',             0),
    -- ---- Festival run ----
    ('Festival run', 'Salaries',         'Production Manager',            0),
    ('Festival run', 'Salaries',         'PM/Mons',                       1),
    ('Festival run', 'Salaries',         'Tour Manager',                  2),
    ('Festival run', 'Salaries',         'Guitar Tech',                   3),
    ('Festival run', 'Salaries',         'Content',                       4),
    ('Festival run', 'Salaries',         'Band (Drums/Guitar/Keys)',      5),
    ('Festival run', 'Per Diem',         'Per diems',                     0),
    ('Festival run', 'Hotel',            'Accommodation',                 0),
    ('Festival run', 'Transport',        'Flights',                       0),
    ('Festival run', 'Transport',        'Bus',                           1),
    ('Festival run', 'Transport',        'Taxis',                         2),
    ('Festival run', 'Transport',        'Fuel',                          3),
    ('Festival run', 'Transport',        'Parking',                       4),
    ('Festival run', 'Transport',        'Misc',                          5),
    ('Festival run', 'Transport',        'Travel agent',                  6),
    ('Festival run', 'Production + Misc', 'Audio & backline hire',         0),
    ('Festival run', 'Production + Misc', 'Lighting hire',                 1),
    ('Festival run', 'Production + Misc', 'Freight / cartage / baggage',   2),
    ('Festival run', 'Production + Misc', 'Equipment purchase',            3),
    ('Festival run', 'Production + Misc', 'Programming',                   4),
    ('Festival run', 'Production + Misc', 'Set & wardrobe',                5),
    ('Festival run', 'Production + Misc', 'Misc',                          6),
    ('Festival run', 'Commissions',      'Agency',                        0),
    ('Festival run', 'Commissions',      'Management',                     1),
    ('Festival run', 'Insurance',        'Insurance',                      0),
    ('Festival run', 'Contingency',      'Contingency',                    0)
) AS l(template_name, section_name, label, sort_order)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------
-- 7. Backfill budget_sections from existing categories
--    For every tour that has line items but no sections yet, create one
--    section per DISTINCT (Title-cased) category, then point each line's
--    section_id at the matching section. Guarded + only touches NULL
--    section_id, so it's safe to re-run.
-- --------------------------------------------
WITH distinct_cats AS (
  SELECT
    li.tour_id,
    li.workspace_id,
    initcap(replace(li.category, '_', ' ')) AS name,
    lower(li.category)                       AS catkey
  FROM public.budget_line_items li
  WHERE li.category IS NOT NULL
    AND li.category <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.budget_sections s WHERE s.tour_id = li.tour_id
    )
  GROUP BY li.tour_id, li.workspace_id, initcap(replace(li.category, '_', ' ')), lower(li.category)
)
INSERT INTO public.budget_sections (tour_id, workspace_id, name, sort_order)
SELECT
  tour_id,
  workspace_id,
  name,
  (row_number() OVER (PARTITION BY tour_id ORDER BY catkey) - 1)::int AS sort_order
FROM distinct_cats;

-- Point existing lines at the section that matches their category name.
UPDATE public.budget_line_items li
SET section_id = s.id
FROM public.budget_sections s
WHERE li.section_id IS NULL
  AND s.tour_id = li.tour_id
  AND s.name = initcap(replace(li.category, '_', ' '));

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert)
-- ============================================
-- UPDATE public.budget_line_items SET section_id = NULL;
-- ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS section_id;
-- ALTER TABLE public.budget_settings  DROP COLUMN IF EXISTS track_phases;
-- DROP TABLE IF EXISTS public.budget_template_lines;
-- DROP TABLE IF EXISTS public.budget_template_sections;
-- DROP TABLE IF EXISTS public.budget_templates;
-- DROP TABLE IF EXISTS public.budget_sections;
-- (drop the indexes implicitly via DROP TABLE / DROP COLUMN above)
