-- ============================================
-- LOWPASS — Budget line UX14 section taxonomy
-- Migration 054
-- ============================================
-- Adds UX14-facing `section` + `sort_order` on budget_line_items.
-- Canonical rows keep existing category + FK linkage; section groups the UI hub.

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS section text;

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.budget_line_items.section IS
  'UX14 bucket: income | expenses | hotels | travel | hire | payroll | per_diems | other';

UPDATE public.budget_line_items SET sort_order = order_index WHERE sort_order = 0;

-- Heuristic backfill from category + linkage (idempotent tweaks allowed)
UPDATE public.budget_line_items
SET section = CASE
  WHEN flight_id IS NOT NULL THEN 'travel'
  WHEN hotel_id IS NOT NULL OR room_id IS NOT NULL THEN 'hotels'
  WHEN gear_id IS NOT NULL OR tour_gear_id IS NOT NULL THEN 'hire'
  WHEN category ILIKE '%income%' OR category ILIKE 'routing%' OR category ILIKE 'show%' THEN 'income'
  WHEN category ILIKE 'hotel%' OR category ILIKE 'accom%' THEN 'hotels'
  WHEN category ILIKE '%flight%' OR category ILIKE 'transport_air%' THEN 'travel'
  WHEN category ILIKE 'transport%' OR category ILIKE 'ground%' THEN 'travel'
  WHEN category ILIKE 'prod_%' OR category ILIKE 'misc%' THEN 'expenses'
  WHEN category ILIKE '%salary%' OR category ILIKE '%payroll%' THEN 'payroll'
  WHEN category ILIKE '%per%diem%' OR category ILIKE 'per_diems%' THEN 'per_diems'
  ELSE 'other'
END
WHERE section IS NULL;

CREATE INDEX IF NOT EXISTS budget_line_items_section_idx ON public.budget_line_items(section);

-- Down (comment):
-- DROP INDEX IF EXISTS budget_line_items_section_idx;
-- ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS section;
-- ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS sort_order;
