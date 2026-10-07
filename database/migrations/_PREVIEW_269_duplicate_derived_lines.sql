-- ============================================
-- PREVIEW for migration 269, step 2 — READ-ONLY. Changes nothing.
--
-- Lists every automatic budget line that has a duplicate (same tour, same
-- source), which line will survive (★), and what each one carries. Run it,
-- read it, then paste 269.
-- ============================================
WITH lines AS (
  SELECT li.id, li.tour_id, t.name AS tour, li.source_entity_type AS family, li.source_entity_id,
         li.label, li.proposed_cost, li.actual_cost, li.created_at,
         (SELECT count(*) FROM public.budget_line_item_transactions x WHERE x.line_item_id = li.id) AS receipts_txns
  FROM public.budget_line_items li
  JOIN public.tours t ON t.id = li.tour_id
  WHERE li.source_entity_type IS NOT NULL AND li.source_entity_id IS NOT NULL
),
ranked AS (
  SELECT l.*,
         count(*) OVER (PARTITION BY tour_id, family, source_entity_id) AS copies,
         row_number() OVER (PARTITION BY tour_id, family, source_entity_id ORDER BY receipts_txns DESC, created_at, id) AS rk
  FROM lines l
)
SELECT tour, family, label,
       CASE WHEN rk = 1 THEN '★ keeps' ELSE 'merged in' END AS outcome,
       proposed_cost, actual_cost, receipts_txns, id
FROM ranked
WHERE copies > 1
ORDER BY tour, family, source_entity_id, rk;
