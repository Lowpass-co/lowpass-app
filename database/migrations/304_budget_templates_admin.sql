-- ============================================
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
    ('Support tour', 'Salaries', 0),
    ('Support tour', 'Per Diems', 1),
    ('Support tour', 'Hotels', 2),
    ('Support tour', 'Transport', 3),
    ('Support tour', 'Production', 4),
    ('Support tour', 'Admin', 5),
    ('Club', 'Salaries', 0),
    ('Club', 'Per Diems', 1),
    ('Club', 'Hotels', 2),
    ('Club', 'Transport', 3),
    ('Club', 'Production', 4),
    ('Club', 'Admin', 5),
    ('Theatre', 'Salaries', 0),
    ('Theatre', 'Per Diems', 1),
    ('Theatre', 'Hotels', 2),
    ('Theatre', 'Transport', 3),
    ('Theatre', 'Production', 4),
    ('Theatre', 'Admin', 5),
    ('Arena', 'Salaries', 0),
    ('Arena', 'Per Diems', 1),
    ('Arena', 'Hotels', 2),
    ('Arena', 'Transport', 3),
    ('Arena', 'Production', 4),
    ('Arena', 'Admin', 5),
    ('Stadium', 'Salaries', 0),
    ('Stadium', 'Per Diems', 1),
    ('Stadium', 'Hotels', 2),
    ('Stadium', 'Transport', 3),
    ('Stadium', 'Production', 4),
    ('Stadium', 'Admin', 5),
    ('Press tour', 'Salaries', 0),
    ('Press tour', 'Per Diems', 1),
    ('Press tour', 'Hotels', 2),
    ('Press tour', 'Transport', 3),
    ('Press tour', 'Press & promo', 4)
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
    ('Support tour', 'Production', 'Rehearsals', 3),
    ('Support tour', 'Production', 'Misc', 4),
    ('Support tour', 'Admin', 'Visas & work permits', 0),
    ('Support tour', 'Admin', 'Passes & laminates', 1),
    ('Support tour', 'Admin', 'Phones & data', 2),
    ('Support tour', 'Admin', 'Bank & card fees', 3),
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
    ('Club', 'Production', 'Rehearsals', 4),
    ('Club', 'Production', 'Misc', 5),
    ('Club', 'Admin', 'Visas & work permits', 0),
    ('Club', 'Admin', 'Passes & laminates', 1),
    ('Club', 'Admin', 'Phones & data', 2),
    ('Club', 'Admin', 'Bank & card fees', 3),
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
    ('Theatre', 'Admin', 'Visas & work permits', 0),
    ('Theatre', 'Admin', 'Passes & laminates', 1),
    ('Theatre', 'Admin', 'Phones & data', 2),
    ('Theatre', 'Admin', 'Bank & card fees', 3),
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
    ('Arena', 'Admin', 'Visas & work permits', 0),
    ('Arena', 'Admin', 'Passes & laminates', 1),
    ('Arena', 'Admin', 'Phones & data', 2),
    ('Arena', 'Admin', 'Bank & card fees', 3),
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
    ('Stadium', 'Admin', 'Visas & work permits', 0),
    ('Stadium', 'Admin', 'Passes & laminates', 1),
    ('Stadium', 'Admin', 'Phones & data', 2),
    ('Stadium', 'Admin', 'Bank & card fees', 3),
    ('Press tour', 'Transport', 'Trains', 0),
    ('Press tour', 'Transport', 'Cars & drivers', 1),
    ('Press tour', 'Transport', 'Taxis', 2),
    ('Press tour', 'Transport', 'Travel agent', 3),
    ('Press tour', 'Press & promo', 'Hair & makeup', 0),
    ('Press tour', 'Press & promo', 'Styling & wardrobe', 1),
    ('Press tour', 'Press & promo', 'Content & photography', 2),
    ('Press tour', 'Press & promo', 'Rehearsal / performance space', 3),
    ('Press tour', 'Press & promo', 'Gifts & hospitality', 4),
    ('Press tour', 'Press & promo', 'Visas & work permits', 5),
    ('Press tour', 'Press & promo', 'Misc', 6)
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
