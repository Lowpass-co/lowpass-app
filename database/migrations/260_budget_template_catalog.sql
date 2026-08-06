-- ============================================
-- LOWPASS — Budget template catalog additions (ATOM)
-- Migration 260
-- ============================================
--
-- Adds the ATOM catalog categories missing from the system budget
-- templates seeded by migration 200. 200 seeds three system
-- templates and marks NONE is_default; 'Headline tour' is the
-- general-purpose mid-scale template, so it is treated as THE
-- default platform template here (documented choice — see
-- NOTES). Nothing on the other two templates is touched, and no
-- is_default flag is flipped.
--
-- What is genuinely missing on 'Headline tour' (existing sections:
-- Salaries, Per Diems, Travel, Accommodation, Production,
-- Marketing, Commissions, Insurance, Contingency):
--   * INCOME — no income section exists at all. New section
--     'Income' (sort_order -1 so it renders first without
--     renumbering the nine existing sections) with lines:
--     Sponsorship / other income, Production reimbursements,
--     Merch projections.
--   * VARIABLE — Catering and Hospitality / rider have no home:
--     new section 'Catering & Hospitality'. Merch costs have no
--     home: new section 'Merch'.
--   * FIXED — Rehearsals is missing: added as a line under
--     Production. (Trucking is covered by the existing
--     'Bus / truck' Travel line; Insurance and Backline are
--     covered by 'Insurance' and 'Audio & backline hire'.)
--   * OTHER — Withholding tax is missing: added under
--     Commissions. (Agency / Management commission lines and
--     Contingency already exist.)
--
-- PERCENTAGE LIMITATION: budget_template_lines has NO percentage
-- semantics (columns are label / default_phase_tag / sort_order
-- only), so 'Withholding tax (%)' ships as an ordinary line whose
-- name flags the intent — no columns invented. Existing
-- Commissions / Contingency lines are left as the plain lines 200
-- seeded.
--
-- Seed mechanics mirror 200 exactly: deterministic md5-derived
-- UUIDs keyed off the same natural names ('lp_sys_template:…',
-- 'lp_sys_section:…', 'lp_sys_line:…'), inserted with
-- ON CONFLICT (id) DO NOTHING.
--
-- HAND-PASTE: pasted by hand into the Supabase SQL editor (no
-- runner, no tracking table). A full re-paste is a no-op.
-- Depends on: 200_budget_sections_templates.sql — if 200 has not
-- been pasted yet, the FK to the 'Headline tour' template id will
-- error loudly (deliberate: better than a silent no-op).
-- Down-migration block at the end.
-- ============================================

-- --------------------------------------------
-- 1. New sections on the 'Headline tour' system template
-- --------------------------------------------
INSERT INTO public.budget_template_sections (id, template_id, workspace_id, name, sort_order)
SELECT
  md5('lp_sys_section:Headline tour|' || s.name)::uuid,
  md5('lp_sys_template:Headline tour')::uuid,
  NULL::uuid,
  s.name,
  s.sort_order
FROM (
  VALUES
    ('Income',                 -1),  -- renders before Salaries (0) without renumbering
    ('Catering & Hospitality',  9),
    ('Merch',                  10)
) AS s(name, sort_order)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------
-- 2. New lines (on both the new sections and existing 200 ones)
--    Section ids derive exactly as in 200, so lines addressed at
--    'Production' / 'Commissions' land on the sections 200 seeded.
-- --------------------------------------------
INSERT INTO public.budget_template_lines
  (id, template_id, template_section_id, workspace_id, label, default_phase_tag, sort_order)
SELECT
  md5('lp_sys_line:Headline tour|' || l.section_name || '|' || l.label)::uuid,
  md5('lp_sys_template:Headline tour')::uuid,
  md5('lp_sys_section:Headline tour|' || l.section_name)::uuid,
  NULL::uuid,
  l.label,
  NULL,
  l.sort_order
FROM (
  VALUES
    -- Income (new section)
    ('Income',                 'Sponsorship / other income',  0),
    ('Income',                 'Production reimbursements',   1),
    ('Income',                 'Merch projections',           2),
    -- Catering & Hospitality (new section)
    ('Catering & Hospitality', 'Catering',                    0),
    ('Catering & Hospitality', 'Hospitality / rider',         1),
    -- Merch (new section)
    ('Merch',                  'Merch costs',                 0),
    -- Production (existing 200 section; lines 0-4 already seeded)
    ('Production',             'Rehearsals',                  5),
    -- Commissions (existing 200 section; lines 0-1 already seeded)
    ('Commissions',            'Withholding tax (%)',         2)
) AS l(section_name, label, sort_order)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert)
-- ============================================
-- DELETE FROM public.budget_template_lines
--   WHERE id IN (
--     md5('lp_sys_line:Headline tour|Income|Sponsorship / other income')::uuid,
--     md5('lp_sys_line:Headline tour|Income|Production reimbursements')::uuid,
--     md5('lp_sys_line:Headline tour|Income|Merch projections')::uuid,
--     md5('lp_sys_line:Headline tour|Catering & Hospitality|Catering')::uuid,
--     md5('lp_sys_line:Headline tour|Catering & Hospitality|Hospitality / rider')::uuid,
--     md5('lp_sys_line:Headline tour|Merch|Merch costs')::uuid,
--     md5('lp_sys_line:Headline tour|Production|Rehearsals')::uuid,
--     md5('lp_sys_line:Headline tour|Commissions|Withholding tax (%)')::uuid
--   );
-- DELETE FROM public.budget_template_sections
--   WHERE id IN (
--     md5('lp_sys_section:Headline tour|Income')::uuid,
--     md5('lp_sys_section:Headline tour|Catering & Hospitality')::uuid,
--     md5('lp_sys_section:Headline tour|Merch')::uuid
--   );
-- ============================================
