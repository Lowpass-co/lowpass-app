-- ============================================
-- LOWPASS — channel list: close the existing numbering gaps
-- Migration 268
-- ============================================
--
-- §CL-1, the one-off backfill. Migration 267 installed the invariant
-- and changed no rows; this closes the gaps that are already there.
--
-- ADAM IS USING THIS PAGE ON A LIVE TOUR. Before pasting this:
--
--   1. Run database/migrations/_PREVIEW_267_channel_list_renumber.sql.
--      It is read-only, needs nothing installed, and prints every
--      row that will move and what it will move to.
--   2. Paste migration 267 (functions only, changes no rows).
--   3. Then paste this.
--
-- This migration is OPTIONAL and it is not urgent. Every write path
-- in the app now normalises the section it touched, so each list
-- fixes itself the first time anyone adds, deletes, copies or drags
-- a row in it. This just does them all at once instead of waiting.
--
-- WHAT IT CHANGES: row_index only — the integer in the # column.
-- It inserts nothing, deletes nothing, and reorders nothing: rows
-- keep their existing relative order and simply get renumbered to
-- 1..N (inputs) and 1..M (outputs) per section. The visible effect
-- is a list that reads 1, 2, 5, 6, 7 becoming 1, 2, 3, 4, 5.
--
-- WHAT IT DOES NOT TOUCH: channel names, mics, DIs, phantom, notes,
-- stage boxes, sub-snakes, patch positions — nothing but the number.
--
-- Numbering: 267 is this branch's other migration; 266 was the
-- previous highest across main and every remote branch.
--
-- Idempotent: normalise_channel_list_indexes returns 0 and writes
-- nothing for a section that already satisfies the invariant, so a
-- second paste is a complete no-op. Safe to re-run.
-- ============================================

DO $$
DECLARE
  v_section uuid;
  v_moved   integer;
  v_rows    integer := 0;
  v_secs    integer := 0;
BEGIN
  IF to_regprocedure('public.normalise_channel_list_indexes(uuid, uuid[])') IS NULL THEN
    RAISE EXCEPTION
      'Migration 267 has not been applied — paste 267_channel_list_numbering_invariant.sql first.';
  END IF;

  FOR v_section IN
    SELECT DISTINCT section_id FROM public.channel_list_rows
  LOOP
    v_moved := public.normalise_channel_list_indexes(v_section);
    IF v_moved > 0 THEN
      v_secs := v_secs + 1;
      v_rows := v_rows + v_moved;
    END IF;
  END LOOP;

  RAISE NOTICE 'CL-1 backfill: renumbered % row(s) across % section(s).', v_rows, v_secs;
END $$;

-- --------------------------------------------
-- VERIFY — should return zero rows. Any row here is a section that
-- is still not 1..N / 1..M and wants looking at by hand.
-- --------------------------------------------
SELECT
  c.section_id,
  coalesce(c.row_kind, 'input')          AS kind,
  count(*)                               AS rows_in_kind,
  max(c.row_index)                       AS highest_number,
  count(*) - count(DISTINCT c.row_index) AS duplicates
FROM public.channel_list_rows c
GROUP BY c.section_id, coalesce(c.row_kind, 'input')
HAVING max(c.row_index) <> count(*)
    OR count(*) <> count(DISTINCT c.row_index);

-- ============================================
-- DOWN MIGRATION (manual)
-- --------------------------------------------
-- There isn't one, and there should not be. The prior state was a
-- set of gaps with no rule behind them — nothing derives it, so
-- nothing can restore it. Restore from a backup if the old numbers
-- are somehow needed.
--
-- Nothing else depends on row_index's absolute value: it is the
-- display number and the sort key, and both are correct after this.
-- ============================================
