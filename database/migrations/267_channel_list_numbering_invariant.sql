-- ============================================
-- LOWPASS — channel list: the numbering invariant
-- Migration 267
-- ============================================
--
-- §CL-1. Adam dragged some channels on a live tour and his channel
-- numbers went 1, 2, 5, 6, 7, 8, 9, 10 — and never came back.
--
-- THE INVARIANT this installs: within one section, input rows occupy
-- row_index 1..N with no gaps and no repeats, and output rows
-- independently occupy 1..M. Nothing else is a legal state.
--
-- Why it was broken. Migration 115 moved numbering to a per-kind
-- model (UNIQUE (section_id, row_kind, row_index): inputs 1..N,
-- outputs 1..M). The reorder RPC from 043 never caught up — it
-- renumbers 1..N across the ENTIRE section, kind-blind, and its
-- +1000000 collision bump is applied to every row in the section
-- while only the listed ids are brought back down. So renumbering
-- one kind strands the other at 1000001+. Combined with a handler
-- that shipped inputs and outputs as one flat id sequence, a single
-- drag interleaved the two independent sequences and left the inputs
-- full of holes. Nothing anywhere renumbered them back, because
-- "1..N" was a convention four separate writers were each trusted to
-- maintain, and each got it wrong in its own way.
--
-- So it stops being a convention. public.normalise_channel_list_indexes
-- is the one definition of the target state; every writer in
-- src/lib/rider-packs/channel-list.ts calls it, and
-- src/lib/channel-list/rowNumbering.ts computes the identical
-- ordering client-side for the optimistic copy (pinned by
-- src/lib/channel-list/rowNumbering.test.tsx). If you change the
-- ORDER BY here, change it there.
--
-- THIS FILE CHANGES NO ROWS. It defines functions only. Existing
-- gaps are closed by migration 268 (or lazily, the first time the
-- operator touches each section — every write path normalises).
-- Run the read-only preview in
-- database/migrations/_PREVIEW_267_channel_list_renumber.sql before
-- 268 to see exactly which rows move and to what.
--
-- Numbering: highest across main AND every remote branch is 266
-- (git log --all over database/migrations, 2026-08-22). 267 is next.
--
-- Idempotent: CREATE OR REPLACE only, plus GRANTs that are no-ops on
-- re-run. Safe to paste twice.
-- ============================================

-- --------------------------------------------
-- 1. The target state, as a pure read.
--
--    Kept separate from the writer so the same expression can be
--    used for the "is anything actually going to change?" gate and
--    for the UPDATE itself — one definition, no chance of the check
--    and the write disagreeing.
--
--    Ordering, mirrored exactly by normaliseRowIndexes() in TS:
--      · rows named in p_ordered_ids first, in the order given
--        (a drag result), de-duplicated first-wins;
--      · then every other row of that kind by ascending row_index.
--    row_index is UNIQUE per (section_id, row_kind) so it is a total
--    order within a kind; created_at/id are defence only.
--
--    SECURITY INVOKER: reads go through the caller's RLS.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.channel_list_target_indexes(
  p_section_id uuid,
  p_ordered_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (id uuid, new_index integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ord AS (
    SELECT u.uid, MIN(u.n) AS ord
    FROM unnest(coalesce(p_ordered_ids, '{}'::uuid[])) WITH ORDINALITY AS u(uid, n)
    GROUP BY u.uid
  )
  SELECT
    c.id,
    (ROW_NUMBER() OVER (
      PARTITION BY coalesce(c.row_kind, 'input')
      ORDER BY (o.ord IS NULL), o.ord, c.row_index, c.created_at, c.id
    ))::integer
  FROM public.channel_list_rows c
  LEFT JOIN ord o ON o.uid = c.id
  WHERE c.section_id = p_section_id;
$$;

-- --------------------------------------------
-- 2. The writer.
--
--    Returns the number of rows it renumbered — 0 when the section
--    already satisfies the invariant, which is the common case and
--    the reason this is safe to call after every single write.
--
--    The collision bump. UNIQUE (section_id, row_kind, row_index) is
--    not deferrable, so rows cannot be shuffled in place. Every row
--    in the section is first shifted above the section's current
--    maximum, which is injective and cannot collide with anything —
--    including a section left half-bumped by an earlier failed run,
--    which this therefore repairs rather than trips over. 043's fixed
--    +1000000 had neither property.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.normalise_channel_list_indexes(
  p_section_id uuid,
  p_ordered_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_offset integer;
  v_changed integer;
BEGIN
  IF p_section_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Nothing to do? Then touch nothing — no writes, no updated_at churn.
  IF NOT EXISTS (
    SELECT 1
    FROM public.channel_list_target_indexes(p_section_id, p_ordered_ids) t
    JOIN public.channel_list_rows c ON c.id = t.id
    WHERE c.row_index IS DISTINCT FROM t.new_index
  ) THEN
    RETURN 0;
  END IF;

  SELECT coalesce(max(row_index), 0) + 1
    INTO v_offset
    FROM public.channel_list_rows
   WHERE section_id = p_section_id;

  UPDATE public.channel_list_rows
     SET row_index = row_index + v_offset
   WHERE section_id = p_section_id;

  -- Recomputed AFTER the bump. The shift is uniform, so relative
  -- order — and therefore the target — is identical.
  UPDATE public.channel_list_rows c
     SET row_index = t.new_index
    FROM public.channel_list_target_indexes(p_section_id, p_ordered_ids) t
   WHERE c.id = t.id;

  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END;
$$;

-- --------------------------------------------
-- 3. Re-point the old reorder RPC at the new one.
--
--    Same signature, same void return, so nothing needs to deploy in
--    step and an older client cannot reintroduce the interleaving —
--    the kind-blind renumber simply no longer exists anywhere.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_channel_list_rows(
  p_section_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM public.normalise_channel_list_indexes(p_section_id, p_ordered_ids);
END;
$$;

-- --------------------------------------------
-- 4. Grants (RLS still applies — these are SECURITY INVOKER).
-- --------------------------------------------
GRANT EXECUTE ON FUNCTION public.channel_list_target_indexes(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_list_target_indexes(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalise_channel_list_indexes(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalise_channel_list_indexes(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.reorder_channel_list_rows(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_channel_list_rows(uuid, uuid[]) TO service_role;

-- ============================================
-- DOWN MIGRATION (manual)
-- --------------------------------------------
-- Restores 043's kind-blind reorder and drops the new functions.
-- Only do this alongside reverting the app branch — the client calls
-- normalise_channel_list_indexes by name on every structural write.
--
-- CREATE OR REPLACE FUNCTION public.reorder_channel_list_rows(
--   p_section_id uuid,
--   p_ordered_ids uuid[]
-- )
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY INVOKER
-- SET search_path = public
-- AS $$
-- DECLARE
--   i int;
--   r_id uuid;
--   n int;
-- BEGIN
--   IF p_ordered_ids IS NULL OR coalesce(array_length(p_ordered_ids, 1), 0) = 0 THEN
--     RETURN;
--   END IF;
--   n := array_length(p_ordered_ids, 1);
--   UPDATE channel_list_rows
--   SET row_index = row_index + 1000000, updated_at = now()
--   WHERE section_id = p_section_id;
--   FOR i IN 1..n LOOP
--     r_id := p_ordered_ids[i];
--     UPDATE channel_list_rows
--     SET row_index = i, updated_at = now()
--     WHERE id = r_id AND section_id = p_section_id;
--   END LOOP;
-- END;
-- $$;
--
-- DROP FUNCTION IF EXISTS public.normalise_channel_list_indexes(uuid, uuid[]);
-- DROP FUNCTION IF EXISTS public.channel_list_target_indexes(uuid, uuid[]);
--
-- (Row numbers already closed up by migration 268 are NOT restorable
--  from here — restore from a backup if the gaps must come back,
--  which they must not.)
-- ============================================
