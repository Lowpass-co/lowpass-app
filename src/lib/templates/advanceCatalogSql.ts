/* ============================================
   LOWPASS — migration 303, generated from the catalogue (Nov 2026)

   `advanceCatalogSql()` is the WHOLE of database/migrations/
   303_advance_catalog_curated.sql. Regenerate it with
     npx tsx scripts/templates/gen303.ts
   never hand-edit the file: a test fails if the two differ.
   ============================================ */

import { ADVANCE_CATALOG, RETIRED_ADVANCE_SECTIONS, type CatalogSectionDef } from './advanceCatalog';
import { ADVANCE_STARTERS } from './tourTemplates';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const list = (xs: string[]) => xs.map(q).join(', ');

function fieldsJson(s: CatalogSectionDef): string {
  const fields = s.fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    ...(f.options ? { options: f.options } : {}),
    ...(f.placeholder ? { placeholder: f.placeholder } : {}),
  }));
  return `${q(JSON.stringify(fields))}::jsonb`;
}

function sectionSql(s: CatalogSectionDef, order: number): string {
  const names = [s.name, ...s.from.filter((n) => n !== s.name)];
  const when = s.showWhen ? `${q(JSON.stringify(s.showWhen))}::jsonb` : 'NULL::jsonb';
  return `-- ---- ${s.name} (${s.fields.length} questions)${s.from.length ? ` — takes over: ${s.from.join(', ')}` : ' — new'} ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = ${q(s.id)}::uuid OR name IN (${list(names)}))
  ORDER BY (id = ${q(s.id)}::uuid) DESC, (name = ${q(s.name)}) DESC, array_position(ARRAY[${list(names)}]::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES (${q(s.id)}::uuid, NULL, 'section', ${q(s.name)}, ${q(s.description)}, ${q(s.icon)}, '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := ${q(s.id)}::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = ${q(s.name)}, description = ${q(s.description)}, icon = ${q(s.icon)},
    fields = ${fieldsJson(s)},
    tm_only = ${s.tmOnly ? 'true' : 'false'}, show_when = ${when}, sort_order = ${order}
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM (${q(s.name)}, ${q(s.description)}, ${q(s.icon)}, ${fieldsJson(s)}, ${s.tmOnly ? 'true' : 'false'}, ${when}, ${order});
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN (${list(names)});
END $$;
`;
}

function starterSql(): string {
  return ADVANCE_STARTERS.map((st) => {
    const rows = st.sections
      .map((n, i) => `(${i}, ${q(n)}, ${(st.always ?? []).includes(n) ? 'true' : 'false'})`)
      .join(',\n    ');
    return `-- ---- ${st.name}: ${st.sections.length} sections ----
WITH comp AS (
  SELECT jsonb_agg(
    jsonb_build_object('template_id', t.id::text, 'label', t.name, 'fields', t.fields, 'order', v.ord)
      || CASE WHEN t.tm_only THEN '{"tm_only": true}'::jsonb ELSE '{}'::jsonb END
      || CASE WHEN NOT v.always AND t.show_when IS NOT NULL THEN jsonb_build_object('show_when', t.show_when) ELSE '{}'::jsonb END
    ORDER BY v.ord) AS sections
  FROM (VALUES
    ${rows}
  ) AS v(ord, name, always)
  JOIN public.advance_templates t
    ON t.workspace_id IS NULL AND t.template_type = 'section' AND t.name = v.name
)
UPDATE public.advance_layout_templates l
SET sections = comp.sections, updated_at = now()
FROM comp
WHERE lower(trim(l.name)) = lower(${q(st.name)})
  AND l.sections IS DISTINCT FROM comp.sections;
`;
  }).join('\n');
}

export function advanceCatalogSql(): string {
  const starterNames = ADVANCE_STARTERS.map((s) => s.name.toLowerCase());
  const keep = ADVANCE_CATALOG.flatMap((s) => [s.name, ...s.from]);
  return `-- ============================================
-- LOWPASS — The advance question catalogue, curated
-- Migration 303
-- ============================================
--
-- GENERATED from src/lib/templates/advanceCatalog.ts + tourTemplates.ts by
--   npx tsx scripts/templates/gen303.ts
-- Never hand-edit — a test fails if this file and the code differ.
--
-- Adam (Nov 2026): "drastically improve all templates … each useful and
-- curated … dressing rooms appears twice". The built-in catalogue had grown
-- from two seeds (003, then 259) that overlapped: the headline set asked ~308
-- questions, many twice. This replaces it with ${ADVANCE_CATALOG.length} sections in which
-- every question is asked once, and rebuilds every workspace's starter
-- templates and every show day that uses one. Adam: "affect everything,
-- site isn't being used yet".
--
--  1. advance_templates.show_when (jsonb): a section shown only when another
--     question has one of the given answers (Weather & Outdoor).
--  2. Each catalogue section takes over its old built-in row (answers are
--     stored per row id + question id, so kept questions keep their answers)
--     or is inserted with a fixed id.
--  3. Workspace copies of built-in sections (forks, 077) are deleted — they
--     would replace the new sections by name. Sections you made yourself stay.
--  4. Retired built-in sections are deleted: ${RETIRED_ADVANCE_SECTIONS.join(', ')}.
--     Their stored answers stay in advance_instances.data, unshown.
--  5. Every workspace's starter templates (${ADVANCE_STARTERS.map((s) => s.name).join(', ')})
--     are rebuilt, and every show day that uses one gets the new sections —
--     INCLUDING customised and sent days (customised is cleared).
--  6. A read-only report of templates and days this did NOT touch.
--
-- HAND-PASTE, idempotent: every write is guarded (IS DISTINCT FROM / NOT
-- EXISTS / ON CONFLICT); a second paste changes nothing.
-- ============================================

-- 1. ------------------------------------------------------------------------
ALTER TABLE public.advance_templates ADD COLUMN IF NOT EXISTS show_when jsonb;
COMMENT ON COLUMN public.advance_templates.show_when IS
  'Shown only when question field (any section of the day) is answered with one of in: {"field": "...", "in": [...]}. 303.';

-- 3 (first, while forked_from_id still points at the old rows). -------------
DELETE FROM public.advance_templates
WHERE workspace_id IS NOT NULL AND forked_from_id IS NOT NULL;

-- 2. ------------------------------------------------------------------------
${ADVANCE_CATALOG.map((s, i) => sectionSql(s, i)).join('\n')}
-- 4. ------------------------------------------------------------------------
DELETE FROM public.advance_templates
WHERE workspace_id IS NULL AND template_type = 'section'
  AND name IN (${list(RETIRED_ADVANCE_SECTIONS)})
  AND name NOT IN (${list(keep)});

-- 5. ------------------------------------------------------------------------
${starterSql()}
UPDATE public.advance_form_configs c
SET sections = l.sections, customised = false
FROM public.advance_layout_templates l
WHERE c.layout_template_id = l.id
  AND lower(trim(l.name)) IN (${list(starterNames)})
  AND (c.sections IS DISTINCT FROM l.sections OR c.customised);

-- 6. Report (read-only): templates and days NOT rebuilt above. -------------
SELECT 'template not rebuilt (not a starter name)' AS what, l.name AS detail, count(c.id) AS days
FROM public.advance_layout_templates l
LEFT JOIN public.advance_form_configs c ON c.layout_template_id = l.id
WHERE lower(trim(l.name)) NOT IN (${list(starterNames)})
GROUP BY l.name
UNION ALL
SELECT 'day with no template', NULL, count(*)
FROM public.advance_form_configs
WHERE layout_template_id IS NULL;

-- ============================================
-- DOWN (manual): not reversible in place — the old catalogue rows were
-- rewritten. To roll back, re-paste 259 (it re-adds its sections by name) and
-- rebuild templates by hand. show_when can be dropped:
--   ALTER TABLE public.advance_templates DROP COLUMN IF EXISTS show_when;
-- ============================================
`;
}
