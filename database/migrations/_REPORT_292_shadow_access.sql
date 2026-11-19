-- ============================================================================
-- _REPORT_292_shadow_access.sql — READ-ONLY. Paste after 292, BEFORE 293.
--
-- One row per Member (role readonly) per area: what they reach TODAY versus
-- what they'll reach once 293's rules are on. Admins and managers are not
-- listed — they keep everything.
--
--   today    — "all tours" for every non-money area (today's rules only check
--              the workspace), or what their page grant gives for money areas.
--   after    — from tour_access: "all tours (view|edit)", "N tours", or "none".
--   change   — LOSES / GAINS / same.
--
-- Read the LOSES rows: each one is something that member can open today and
-- won't after 293. Fix by giving access on the Members screen (or a row in
-- tour_access) before pasting 293.
-- ============================================================================
WITH areas(area, money, legacy) AS (VALUES
  ('advance',    false, NULL),
  ('production', false, NULL),
  ('parking',    false, NULL),
  ('logistics',  false, NULL),
  ('files',      false, NULL),
  ('schedule',   false, NULL),
  ('budget',     true,  ARRAY['budget.line_items','budget.summary']),
  ('receipts',   true,  ARRAY['budget.receipts']),
  ('payroll',    true,  ARRAY['budget.payroll','operations.payroll','operations.personnel.compensation']),
  ('income',     true,  ARRAY['budget.deal_memos','budget.commissions'])
),
members AS (
  SELECT m.id AS member_id, m.workspace_id, m.user_id, w.name AS workspace,
         coalesce(p.email, m.user_id::text) AS who
    FROM public.workspace_members m
    JOIN public.workspaces w ON w.id = m.workspace_id
    LEFT JOIN public.profiles p ON p.id = m.user_id
   WHERE m.role = 'readonly'
),
legacy AS (
  SELECT mb.member_id, a.area,
         CASE WHEN NOT a.money THEN 'all tours (edit)'
              WHEN bool_or(g.permission = 'write') THEN 'all tours (edit)'
              WHEN bool_or(g.permission = 'read') THEN 'all tours (view)'
              ELSE 'none' END AS today
    FROM members mb
   CROSS JOIN areas a
    LEFT JOIN public.permission_grants g
      ON g.workspace_id = mb.workspace_id
     AND g.resource_id = ANY (a.legacy)
     AND ((g.subject_type = 'user' AND g.subject_id = mb.user_id::text)
          OR (g.subject_type = 'tag' AND EXISTS (
                SELECT 1 FROM public.workspace_member_tags t
                 WHERE t.member_id = mb.member_id AND t.tag_name = g.subject_id)))
   GROUP BY mb.member_id, a.area, a.money
),
after AS (
  SELECT mb.member_id, a.area,
         CASE WHEN bool_or(ta.id IS NOT NULL AND ta.tour_id IS NULL AND ta.level = 'edit') THEN 'all tours (edit)'
              WHEN bool_or(ta.id IS NOT NULL AND ta.tour_id IS NULL) THEN 'all tours (view)'
              WHEN count(ta.id) > 0 THEN count(ta.id) || ' tour(s)'
              ELSE 'none' END AS after
    FROM members mb
   CROSS JOIN areas a
    LEFT JOIN public.tour_access ta ON ta.member_id = mb.member_id AND ta.area = a.area
   GROUP BY mb.member_id, a.area
)
SELECT mb.workspace, mb.who AS member, l.area, l.today, af.after,
       CASE WHEN l.today = af.after THEN 'same'
            WHEN l.today = 'none' THEN 'GAINS'
            WHEN af.after = 'none' THEN 'LOSES'
            WHEN l.today = 'all tours (edit)' THEN 'LOSES (narrower)'
            ELSE 'changes' END AS change
  FROM members mb
  JOIN legacy l ON l.member_id = mb.member_id
  JOIN after af ON af.member_id = mb.member_id AND af.area = l.area
 ORDER BY mb.workspace, mb.who, l.area;

-- Members with no access to anything after 293 (they'd see an empty app):
--   SELECT p.email FROM public.workspace_members m LEFT JOIN public.profiles p ON p.id = m.user_id
--    WHERE m.role = 'readonly' AND NOT EXISTS (SELECT 1 FROM public.tour_access a WHERE a.member_id = m.id);
