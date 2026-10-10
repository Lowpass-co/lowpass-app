-- ============================================
-- LOWPASS — deleting a budget line or section no longer collides with the
--           budget's saved versions
-- Migration 270
-- ============================================
--
-- Paste into the Supabase SQL Editor and Run. Safe to paste twice: every
-- step is guarded (DROP … IF EXISTS / CREATE OR REPLACE).
--
-- THE BUG. A saved (approved or superseded) budget version keeps a frozen
-- copy of every line and section — budget_version_lines /
-- budget_version_sections — and migration 212's trigger refuses ANY change
-- to a frozen copy. But those copies were tied to the live rows with
-- ON DELETE CASCADE / SET NULL foreign keys. So deleting a live line that
-- existed when an old version was saved tried to delete (or null) its frozen
-- copy, the trigger refused, and the delete failed with
--   "budget version … is locked (status=superseded); its proposed snapshot
--    is immutable".
-- In practice: once a budget had been approved once, most of its lines and
-- sections could never be deleted again — from the grid or anywhere else.
-- Migration 233 hit the same wall and left "pinned" empty twin sections in
-- place (the empty "Salary" next to "Salaries").
--
-- THE FIX. A frozen copy already carries everything it needs on its own row
-- (label, category, section, proposed cost, currency), so it does not need
-- the live row to exist. This migration:
--   1. drops the three foreign keys from the snapshot tables to the live
--      rows (line_item_id, section_id on version lines; section_id on
--      version sections). The columns stay — they still record which live
--      row the copy was taken from;
--   2. replaces the cascade with triggers that tidy up DRAFT versions only
--      (a draft is still being edited, so its copy of a deleted row should go;
--      the lock trigger allows draft changes). Saved versions are never
--      touched, so history is kept exactly as it was saved;
--   3. makes "amend" copy only rows that still exist, so a deleted line
--      doesn't come back in the next draft.
--
-- No data is changed by running this.
-- ============================================

-- 1. Drop the snapshot → live foreign keys, whatever they were named.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname, rel.relname
    FROM pg_constraint con
    JOIN pg_class rel  ON rel.oid  = con.conrelid
    JOIN pg_class ref  ON ref.oid  = con.confrelid
    JOIN pg_namespace n ON n.oid   = rel.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
      AND rel.relname IN ('budget_version_lines', 'budget_version_sections')
      AND ref.relname IN ('budget_line_items', 'budget_sections')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', c.relname, c.conname);
  END LOOP;
END $$;

-- 2a. A deleted live line leaves DRAFT versions too (saved versions keep it).
CREATE OR REPLACE FUNCTION public.budget_line_deleted_tidy_drafts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.budget_version_lines vl
  USING public.budget_versions v
  WHERE vl.version_id = v.id
    AND v.status = 'draft'
    AND vl.line_item_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_budget_line_deleted_tidy_drafts ON public.budget_line_items;
CREATE TRIGGER trg_budget_line_deleted_tidy_drafts
  AFTER DELETE ON public.budget_line_items
  FOR EACH ROW EXECUTE FUNCTION public.budget_line_deleted_tidy_drafts();

-- 2b. A deleted live section leaves DRAFT versions too, and draft copies of
--     lines that pointed at it lose the pointer (what SET NULL used to do).
CREATE OR REPLACE FUNCTION public.budget_section_deleted_tidy_drafts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.budget_version_sections vs
  USING public.budget_versions v
  WHERE vs.version_id = v.id
    AND v.status = 'draft'
    AND vs.section_id = OLD.id;

  UPDATE public.budget_version_lines vl
  SET section_id = NULL
  FROM public.budget_versions v
  WHERE vl.version_id = v.id
    AND v.status = 'draft'
    AND vl.section_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_budget_section_deleted_tidy_drafts ON public.budget_sections;
CREATE TRIGGER trg_budget_section_deleted_tidy_drafts
  AFTER DELETE ON public.budget_sections
  FOR EACH ROW EXECUTE FUNCTION public.budget_section_deleted_tidy_drafts();

-- 3. Amend (new draft from the approved version) clones only rows whose live
--    line / section still exists. Without the foreign keys, the approved
--    version can hold copies of lines deleted since; carrying those into a
--    new DRAFT would bring them back as phantoms. Identical to migration
--    220's definition apart from the two EXISTS filters.
CREATE OR REPLACE FUNCTION public.amend_budget_version(p_tour_id uuid)
RETURNS public.budget_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  src public.budget_versions;
  v   public.budget_versions;
  next_num int;
BEGIN
  IF NOT public.is_budget_approver() THEN
    RAISE EXCEPTION 'not authorised to amend budget versions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO src FROM public.budget_versions
   WHERE tour_id = p_tour_id AND workspace_id = public.get_my_workspace_id() AND status = 'approved'
   LIMIT 1;
  IF src.id IS NULL THEN RAISE EXCEPTION 'no approved version to amend'; END IF;
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_num
    FROM public.budget_versions WHERE tour_id = p_tour_id;
  INSERT INTO public.budget_versions (tour_id, workspace_id, version_number, status, parent_version_id, created_by, note)
  VALUES (p_tour_id, src.workspace_id, next_num, 'draft', src.id, auth.uid(), 'Amended from v' || src.version_number)
  RETURNING * INTO v;
  -- clone the snapshots into the new draft (status='draft' → immutability trigger allows)
  INSERT INTO public.budget_version_sections (version_id, section_id, workspace_id, name, sort_order)
  SELECT v.id, vs.section_id, vs.workspace_id, vs.name, vs.sort_order
  FROM public.budget_version_sections vs
  WHERE vs.version_id = src.id
    AND EXISTS (SELECT 1 FROM public.budget_sections s WHERE s.id = vs.section_id);
  INSERT INTO public.budget_version_lines (version_id, line_item_id, workspace_id, section_id, label, category, proposed_cost, quantity, currency, order_index, present)
  SELECT v.id, vl.line_item_id, vl.workspace_id,
         CASE WHEN EXISTS (SELECT 1 FROM public.budget_sections s WHERE s.id = vl.section_id) THEN vl.section_id END,
         vl.label, vl.category, vl.proposed_cost, vl.quantity, vl.currency, vl.order_index, vl.present
  FROM public.budget_version_lines vl
  WHERE vl.version_id = src.id
    AND EXISTS (SELECT 1 FROM public.budget_line_items li WHERE li.id = vl.line_item_id);
  INSERT INTO public.budget_version_income (
    version_id, routing_id, workspace_id,
    pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income, currency,
    capacity, est_sell_thru, face_value, deal_type, deal_pct, deal_threshold, deal_pct_above,
    dollars_per_head, merch_fee_pct, vip_tickets, vip_price,
    overage_is_override, merch_is_override, vip_is_override
  )
  SELECT
    v.id, routing_id, workspace_id,
    pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income, currency,
    capacity, est_sell_thru, face_value, deal_type, deal_pct, deal_threshold, deal_pct_above,
    dollars_per_head, merch_fee_pct, vip_tickets, vip_price,
    overage_is_override, merch_is_override, vip_is_override
  FROM public.budget_version_income WHERE version_id = src.id;
  -- supersede the prior approved AFTER cloning (so the one-approved index never sees two)
  UPDATE public.budget_versions SET status = 'superseded', updated_at = now() WHERE id = src.id;
  RETURN v;
END;
$$;

-- Verify (read-only): should return 0 rows — no snapshot FK to live rows left.
-- SELECT con.conname, rel.relname
-- FROM pg_constraint con
-- JOIN pg_class rel ON rel.oid = con.conrelid
-- JOIN pg_class ref ON ref.oid = con.confrelid
-- WHERE con.contype = 'f'
--   AND rel.relname IN ('budget_version_lines', 'budget_version_sections')
--   AND ref.relname IN ('budget_line_items', 'budget_sections');

-- ============================================
-- DOWN (do not run unless reverting; re-adding the FKs FAILS if any live row
-- has been deleted since, because its saved copies now point at nothing —
-- which is the point of this migration):
--
-- DROP TRIGGER IF EXISTS trg_budget_line_deleted_tidy_drafts ON public.budget_line_items;
-- DROP TRIGGER IF EXISTS trg_budget_section_deleted_tidy_drafts ON public.budget_sections;
-- DROP FUNCTION IF EXISTS public.budget_line_deleted_tidy_drafts();
-- DROP FUNCTION IF EXISTS public.budget_section_deleted_tidy_drafts();
-- (amend_budget_version: re-paste its definition from migration 220.)
-- ALTER TABLE public.budget_version_lines
--   ADD CONSTRAINT budget_version_lines_line_item_id_fkey
--   FOREIGN KEY (line_item_id) REFERENCES public.budget_line_items(id) ON DELETE CASCADE;
-- ALTER TABLE public.budget_version_lines
--   ADD CONSTRAINT budget_version_lines_section_id_fkey
--   FOREIGN KEY (section_id) REFERENCES public.budget_sections(id) ON DELETE SET NULL;
-- ALTER TABLE public.budget_version_sections
--   ADD CONSTRAINT budget_version_sections_section_id_fkey
--   FOREIGN KEY (section_id) REFERENCES public.budget_sections(id) ON DELETE CASCADE;
-- ============================================
