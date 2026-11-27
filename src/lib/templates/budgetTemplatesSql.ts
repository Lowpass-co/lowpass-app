/* ============================================
   LOWPASS — migration 304, generated from BUDGET_TEMPLATES (Nov 2026)

   `budgetTemplatesSql()` is the WHOLE of database/migrations/
   304_budget_templates_admin.sql. Regenerate with
     npx tsx scripts/templates/gen304.ts
   A test fails if the file and the lists in tourTemplates.ts differ.
   ============================================ */

import { BUDGET_TEMPLATES } from './tourTemplates';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function budgetTemplatesSql(): string {
  const sections = BUDGET_TEMPLATES.flatMap((t) => t.sections.map((s, i) => `    (${q(t.name)}, ${q(s.name)}, ${i})`)).join(',\n');
  const lines = BUDGET_TEMPLATES.flatMap((t) => t.sections.flatMap((s) => s.lines.map((l, i) => `    (${q(t.name)}, ${q(s.name)}, ${q(l)}, ${i})`))).join(',\n');
  return `-- ============================================
-- LOWPASS — Budget templates: Admin section, Rehearsals, visas
-- Migration 304
-- ============================================
--
-- GENERATED from src/lib/templates/tourTemplates.ts (BUDGET_TEMPLATES) by
--   npx tsx scripts/templates/gen304.ts
-- Never hand-edit — a test fails if this file and the code differ.
--
-- Adam (Nov 2026): every template except Press tour gets an Admin section
-- (Visas & work permits · Passes & laminates · Phones & data · Bank & card
-- fees — costs that had no home and ended up in Misc); Support tour and Club
-- get Rehearsals under Production; Press tour gets Visas & work permits under
-- Press & promo. Lines and sections already there keep their ids (the same
-- deterministic ids as 280) and only their order is brought up to date.
-- Only NEW tours see this — a template is copied when a tour starts from it.
--
-- HAND-PASTE, idempotent: inserts are ON CONFLICT, order updates are guarded.
-- Depends on 280.
-- ============================================

INSERT INTO public.budget_template_sections (id, template_id, workspace_id, name, sort_order)
SELECT md5('lp_sys_section:' || s.template_name || '|' || s.name)::uuid,
       md5('lp_sys_template:' || s.template_name)::uuid, NULL::uuid, s.name, s.sort_order
FROM (
  VALUES
${sections}
) AS s(template_name, name, sort_order)
WHERE EXISTS (SELECT 1 FROM public.budget_templates b WHERE b.id = md5('lp_sys_template:' || s.template_name)::uuid)
ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order
  WHERE public.budget_template_sections.sort_order IS DISTINCT FROM EXCLUDED.sort_order;

INSERT INTO public.budget_template_lines
  (id, template_id, template_section_id, workspace_id, label, default_phase_tag, sort_order)
SELECT md5('lp_sys_line:' || l.template_name || '|' || l.section_name || '|' || l.label)::uuid,
       md5('lp_sys_template:' || l.template_name)::uuid,
       md5('lp_sys_section:' || l.template_name || '|' || l.section_name)::uuid,
       NULL::uuid, l.label, NULL, l.sort_order
FROM (
  VALUES
${lines}
) AS l(template_name, section_name, label, sort_order)
WHERE EXISTS (SELECT 1 FROM public.budget_templates b WHERE b.id = md5('lp_sys_template:' || l.template_name)::uuid)
ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order
  WHERE public.budget_template_lines.sort_order IS DISTINCT FROM EXCLUDED.sort_order;

-- ============================================
-- DOWN (manual):
--   DELETE FROM public.budget_template_lines WHERE id IN (… the new ids …);
--   DELETE FROM public.budget_template_sections
--    WHERE id = ANY(ARRAY(SELECT md5('lp_sys_section:' || n || '|Admin')::uuid
--      FROM unnest(ARRAY['Support tour','Club','Theatre','Arena','Stadium']) n));
-- ============================================
`;
}
