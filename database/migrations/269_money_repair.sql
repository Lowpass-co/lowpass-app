-- ============================================
-- LOWPASS — money repair: atomic payroll paints, one budget line per source,
--           phone receipts reach the Receipts bank
-- Migration 269
-- ============================================
--
-- Paste into the Supabase SQL Editor and Run. Safe to paste twice: every
-- step is guarded (CREATE OR REPLACE / IF NOT EXISTS / a no-op when there is
-- nothing to merge).
--
-- OPTIONAL BUT RECOMMENDED: run _PREVIEW_269_duplicate_derived_lines.sql
-- first. It is read-only and lists every duplicate line step 2 will merge.
--
-- The app works WITHOUT this migration — each piece has a code fallback —
-- it is just safer with it:
--
--   1. payroll_merge_day_statuses()  — merges a paint into the stored week
--      under the row lock. Without it the API uses a compare-and-swap retry.
--
--   2. One derived budget line per source — merges existing duplicates
--      (moving their transactions, notes, attachments and receipt links to
--      the surviving line first), then adds a unique index so two screens
--      can never create the same automatic line twice again. Without it the
--      app still merges duplicates when it finds them.
--
--   3. expense_receipts.source_expense_id — links a phone-captured expense to
--      the receipt it created in the Receipts bank, so each one is filed once.
--      Without it phone receipts are still filed, just without the link.
-- ============================================


-- ── 1. Atomic payroll paint merge ───────────────────────────────────────────
-- p_changes: {"2026-08-15": "show", "2026-08-16": null}   (null = clear)
-- SECURITY INVOKER (the default): RLS applies exactly as for the old upsert.
CREATE OR REPLACE FUNCTION public.payroll_merge_day_statuses(
  p_tour_id      uuid,
  p_personnel_id uuid,
  p_week_start   date,
  p_changes      jsonb,
  p_person_id    uuid    DEFAULT NULL,
  p_set_notes    boolean DEFAULT false,
  p_notes        text    DEFAULT NULL
)
RETURNS public.payroll_entries
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r public.payroll_entries;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'p_changes must be a JSON object' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payroll_entries AS pe
    (tour_id, workspace_id, personnel_id, person_id, week_start, day_statuses, notes, updated_at)
  SELECT p_tour_id, pr.workspace_id, p_personnel_id, p_person_id, p_week_start,
         jsonb_strip_nulls(p_changes),
         CASE WHEN p_set_notes THEN p_notes END,
         now()
  FROM public.personnel_rates pr
  WHERE pr.id = p_personnel_id AND pr.tour_id = p_tour_id
  ON CONFLICT (personnel_id, week_start) DO UPDATE
    SET day_statuses = (
          SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
          FROM jsonb_each(coalesce(pe.day_statuses, '{}'::jsonb) || p_changes) AS e
          WHERE e.value <> 'null'::jsonb
        ),
        person_id  = coalesce(p_person_id, pe.person_id),
        notes      = CASE WHEN p_set_notes THEN p_notes ELSE pe.notes END,
        updated_at = now()
  RETURNING pe.* INTO r;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'rate card % is not on tour %', p_personnel_id, p_tour_id USING ERRCODE = 'P0002';
  END IF;
  RETURN r;
END
$$;

GRANT EXECUTE ON FUNCTION public.payroll_merge_day_statuses(uuid, uuid, date, jsonb, uuid, boolean, text) TO authenticated;


-- ── 2. One derived budget line per source ───────────────────────────────────
-- Survivor = the line with the most transactions, then the oldest.
-- A duplicate that can't be deleted (an APPROVED version's frozen snapshot
-- references it) is neutralised instead: unlinked from its source, actual 0,
-- and labelled so it can be found.
DO $$
DECLARE
  g         RECORD;
  survivor  uuid;
  loser     uuid;
  v_merged  int := 0;
  v_kept    int := 0;
  child     RECORD;
BEGIN
  FOR g IN
    SELECT x.tour_id, x.source_entity_type, x.source_entity_id,
           array_agg(x.id ORDER BY x.txn_count DESC, x.created_at, x.id) AS ids
    FROM (
      SELECT li.id, li.tour_id, li.source_entity_type, li.source_entity_id, li.created_at,
             (SELECT count(*) FROM public.budget_line_item_transactions t WHERE t.line_item_id = li.id) AS txn_count
      FROM public.budget_line_items li
      WHERE li.source_entity_type IS NOT NULL AND li.source_entity_id IS NOT NULL
    ) x
    GROUP BY x.tour_id, x.source_entity_type, x.source_entity_id
    HAVING count(*) > 1
  LOOP
    survivor := g.ids[1];
    FOREACH loser IN ARRAY g.ids[2:array_length(g.ids, 1)] LOOP
      -- Move everything attached BEFORE the delete (delete cascades).
      FOR child IN
        SELECT * FROM (VALUES
          ('budget_line_item_transactions', 'line_item_id'),
          ('budget_line_item_notes',        'line_item_id'),
          ('budget_line_item_attachments',  'line_item_id'),
          ('expense_receipts',              'linked_line_item_id')
        ) AS c(tbl, col)
      LOOP
        IF to_regclass('public.' || child.tbl) IS NOT NULL THEN
          EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', child.tbl, child.col, child.col)
            USING survivor, loser;
        END IF;
      END LOOP;

      BEGIN
        DELETE FROM public.budget_line_items WHERE id = loser;
        v_merged := v_merged + 1;
      EXCEPTION WHEN others THEN
        UPDATE public.budget_line_items
           SET source_entity_type = NULL,
               source_entity_id   = NULL,
               hotel_id           = NULL,
               flight_id          = NULL,
               gear_id            = NULL,
               tour_gear_id       = NULL,
               actual_cost        = 0,
               label              = coalesce(label, '') || ' (duplicate — safe to delete)',
               updated_at         = now()
         WHERE id = loser;
        v_kept := v_kept + 1;
      END;
    END LOOP;
  END LOOP;

  RAISE NOTICE '269 step 2: % duplicate derived lines merged and removed; % neutralised (an approved snapshot references them).',
    v_merged, v_kept;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS budget_line_items_one_per_source
  ON public.budget_line_items (tour_id, source_entity_type, source_entity_id)
  WHERE source_entity_type IS NOT NULL AND source_entity_id IS NOT NULL;


-- ── 3. Phone receipts → Receipts bank link ──────────────────────────────────
ALTER TABLE public.expense_receipts
  ADD COLUMN IF NOT EXISTS source_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expense_receipts_source_expense_id_key
  ON public.expense_receipts (source_expense_id)
  WHERE source_expense_id IS NOT NULL;


-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert). Step 2's merges are not
-- reversible (they are the fix); the index and the function are.
-- ============================================
-- DROP INDEX IF EXISTS public.expense_receipts_source_expense_id_key;
-- ALTER TABLE public.expense_receipts DROP COLUMN IF EXISTS source_expense_id;
-- DROP INDEX IF EXISTS public.budget_line_items_one_per_source;
-- DROP FUNCTION IF EXISTS public.payroll_merge_day_statuses(uuid, uuid, date, jsonb, uuid, boolean, text);
