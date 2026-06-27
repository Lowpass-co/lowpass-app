-- ============================================
-- LOWPASS — Income output overrides (#28 Phase B)
-- Migration 220
-- ============================================
--
-- Manual override of a computed projected output (Overage / Merch / VIP). After
-- the projection fix those three are computed-locked + recomputed by default; a
-- PLUS / FLAT / one-off deal needs to deliberately hand-enter a value that an
-- input edit won't clobber. (Stage-A map: docs/handover/INCOME_OVERRIDE_MAP.md.)
--
-- STORAGE — Option A (locked): a per-output BOOLEAN flag. The override VALUE
-- keeps living in the existing materialised column (pre_tax_overage /
-- merch_income / vip_income) — NO new value columns — so computeBudgetPnl + the
-- grid read those columns unchanged. The route gates each recompute on the flag
-- (recomputeOverage = has(OVERAGE_INPUTS) && !overage_is_override, ×3). An unset
-- flag always recomputes → structurally cannot reintroduce the persistent-0 bug.
--
-- WITHHOLDING (locked): unchanged. An overridden overage is the PRE-withholding
-- figure exactly like a computed one; the P&L still derives
-- post_tax_overage = postTaxFromPreTax(pre_tax_overage, withholding_pct).
--
-- Additive, nullable-with-default, idempotent. Down-block at the end.

-- ---- 1. the three flags on the live PROPOSED source ----
ALTER TABLE public.budget_income
  ADD COLUMN IF NOT EXISTS overage_is_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merch_is_override   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_is_override     BOOLEAN NOT NULL DEFAULT false;

-- ---- 2. the version snapshot mirror (versioning tax — they lock + roll like
--         any other versioned income column) ----
ALTER TABLE public.budget_version_income
  ADD COLUMN IF NOT EXISTS overage_is_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merch_is_override   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_is_override     BOOLEAN NOT NULL DEFAULT false;

-- ---- 3. amend (clone-approved → new draft) must carry the full income column
--         set. amend_budget_version (migration 212) predates BOTH the projection
--         inputs (217) AND these flags, so as written it silently DROPS them on
--         amend. CREATE OR REPLACE with the complete column list — fixes the 217
--         latent gap and carries the overrides. The rollback RPC (219) only flips
--         budget_versions.status and never copies income, so frozen snapshots
--         carry the flags automatically — no change there.
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
  SELECT v.id, section_id, workspace_id, name, sort_order FROM public.budget_version_sections WHERE version_id = src.id;
  INSERT INTO public.budget_version_lines (version_id, line_item_id, workspace_id, section_id, label, category, proposed_cost, quantity, currency, order_index, present)
  SELECT v.id, line_item_id, workspace_id, section_id, label, category, proposed_cost, quantity, currency, order_index, present FROM public.budget_version_lines WHERE version_id = src.id;
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

-- ============================================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================================
-- ALTER TABLE public.budget_income
--   DROP COLUMN IF EXISTS overage_is_override,
--   DROP COLUMN IF EXISTS merch_is_override,
--   DROP COLUMN IF EXISTS vip_is_override;
-- ALTER TABLE public.budget_version_income
--   DROP COLUMN IF EXISTS overage_is_override,
--   DROP COLUMN IF EXISTS merch_is_override,
--   DROP COLUMN IF EXISTS vip_is_override;
-- -- (amend_budget_version keeps the wider column list — harmless without the flags;
-- --  re-apply migration 212's body to fully revert.)
