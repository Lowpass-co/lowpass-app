-- ============================================
-- LOWPASS — READ-ONLY preview for the §CL-1 channel-number backfill
-- ============================================
--
-- RUN THIS FIRST, BEFORE migrations 267 and 268.
--
-- It writes nothing. It has NO dependency on 267 — the target
-- numbering is recomputed inline with the same ordering rule the
-- function uses, so this shows you the truth before anything about
-- the database has changed.
--
-- Adam is using this page on a live tour. Query A is the number to
-- sanity-check first: if it says more rows move than you expect,
-- stop and say so rather than pasting 268.
--
-- The rule being previewed: within a section, input rows renumber to
-- 1..N and output rows independently to 1..M, each in ascending
-- current row_index order. Nothing is reordered — only the numbers
-- printed in the # column change, and only where they were wrong.
-- No row is inserted, deleted, or moved.
-- ============================================


-- --------------------------------------------
-- QUERY A — the headline. How much moves, and where.
-- --------------------------------------------
WITH target AS (
  SELECT
    c.id,
    c.section_id,
    coalesce(c.row_kind, 'input') AS kind,
    c.row_index AS current_number,
    (ROW_NUMBER() OVER (
      PARTITION BY c.section_id, coalesce(c.row_kind, 'input')
      ORDER BY c.row_index, c.created_at, c.id
    ))::integer AS new_number
  FROM public.channel_list_rows c
)
SELECT
  s.title                                        AS section,
  p.title                                        AS pack,
  t.kind,
  count(*)                                       AS rows_in_kind,
  count(*) FILTER (WHERE t.current_number <> t.new_number) AS rows_that_move,
  min(t.current_number)                          AS lowest_number_now,
  max(t.current_number)                          AS highest_number_now,
  max(t.new_number)                              AS highest_number_after
FROM target t
JOIN public.rider_sections s ON s.id = t.section_id
JOIN public.rider_packs   p ON p.id = s.pack_id
GROUP BY s.title, p.title, t.kind, t.section_id
HAVING count(*) FILTER (WHERE t.current_number <> t.new_number) > 0
ORDER BY p.title, s.title, t.kind;


-- --------------------------------------------
-- QUERY B — every single row that changes, and to what.
--
-- This is the one to eyeball for the tour you are actually running.
-- Add   AND s.title = '<your section>'   to narrow it.
-- --------------------------------------------
WITH target AS (
  SELECT
    c.id,
    c.section_id,
    c.channel_name,
    c.mic,
    coalesce(c.row_kind, 'input') AS kind,
    c.row_index AS current_number,
    (ROW_NUMBER() OVER (
      PARTITION BY c.section_id, coalesce(c.row_kind, 'input')
      ORDER BY c.row_index, c.created_at, c.id
    ))::integer AS new_number
  FROM public.channel_list_rows c
)
SELECT
  p.title            AS pack,
  s.title            AS section,
  t.kind,
  t.current_number   AS "# now",
  t.new_number       AS "# after",
  t.channel_name,
  t.mic
FROM target t
JOIN public.rider_sections s ON s.id = t.section_id
JOIN public.rider_packs   p ON p.id = s.pack_id
WHERE t.current_number <> t.new_number
ORDER BY p.title, s.title, t.kind, t.new_number;


-- --------------------------------------------
-- QUERY C — the damage report. Which sections are broken today,
-- and in which of the three ways.
--
--   gaps       — numbering skips (Adam's 1, 2, 5, 6, 7, 8, 9, 10)
--   duplicates — two rows of one kind sharing a number
--   stranded   — rows left at 1000001+ by a half-finished 043 reorder
-- --------------------------------------------
SELECT
  p.title  AS pack,
  s.title  AS section,
  coalesce(c.row_kind, 'input') AS kind,
  count(*)                                   AS rows_in_kind,
  max(c.row_index)                           AS highest_number,
  max(c.row_index) - count(*)                AS gaps,
  count(*) - count(DISTINCT c.row_index)     AS duplicates,
  count(*) FILTER (WHERE c.row_index > 1000000) AS stranded
FROM public.channel_list_rows c
JOIN public.rider_sections s ON s.id = c.section_id
JOIN public.rider_packs   p ON p.id = s.pack_id
GROUP BY p.title, s.title, c.section_id, coalesce(c.row_kind, 'input')
HAVING max(c.row_index) <> count(*)
    OR count(*) <> count(DISTINCT c.row_index)
ORDER BY p.title, s.title, kind;
