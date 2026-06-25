-- ============================================
-- LOWPASS — Budget Versioning Phase 1 (B1: data + state)
-- Migration 212
-- ============================================
--
-- Adds proposed-budget VERSIONING while ACTUALS stay one live tour-level layer.
-- Decisions: BUDGET_VERSIONING_DESIGN.md §6 + BUDGET_VERSIONING_MAP.md (D-CRUX=b,
-- D-INCOME=version now, D-APPROVER=grant table).
--
--   - budget_line_items / budget_income remain the CANONICAL identity carrying
--     ACTUALS (actual_cost / actual_*) + receipts + routing + source_entity_*.
--     Untouched here.
--   - PROPOSED is snapshotted per version:
--       budget_version_lines    — proposed_cost + structure per (version, line)
--       budget_version_sections — section membership/order per version
--       budget_version_income   — proposed income columns per (version, routing)
--   - Variance = approved version_lines.proposed_cost ⋈ budget_line_items.actual_cost
--     on line_item_id (exact).
--
-- INTEGRITY (not route-only): a BEFORE INSERT/UPDATE/DELETE trigger denies any
-- write to the version_* snapshot tables when the parent version is not 'draft'
-- (a locked version is uncorruptable even by a buggy server path). A second
-- trigger requires an approver for any status transition touching 'approved'.
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT). Backfill scaffolds
-- one DRAFT v1 per existing tour from the current proposed values. Down-block at end.

-- ============================================================
-- 1. budget_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id           UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  version_number    INT  NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'approved', 'superseded')),
  parent_version_id UUID REFERENCES public.budget_versions(id) ON DELETE SET NULL,
  note              TEXT,
  created_by        UUID,
  approved_by       UUID,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tour_id, version_number)
);

-- Load-bearing for concurrency: at most ONE approved version per tour. Two
-- simultaneous approves → the second fails on this index (do NOT drop it).
CREATE UNIQUE INDEX IF NOT EXISTS budget_versions_one_approved_per_tour
  ON public.budget_versions (tour_id)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS budget_versions_tour_idx ON public.budget_versions (tour_id);

-- ============================================================
-- 2. Per-version PROPOSED snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_version_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   UUID NOT NULL REFERENCES public.budget_versions(id) ON DELETE CASCADE,
  section_id   UUID NOT NULL REFERENCES public.budget_sections(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  sort_order   INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (version_id, section_id)
);

CREATE TABLE IF NOT EXISTS public.budget_version_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id    UUID NOT NULL REFERENCES public.budget_versions(id) ON DELETE CASCADE,
  -- the STABLE identity (carries actuals/receipts/routing/source on the canonical row)
  line_item_id  UUID NOT NULL REFERENCES public.budget_line_items(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  section_id    UUID REFERENCES public.budget_sections(id) ON DELETE SET NULL,
  label         TEXT,
  category      TEXT,
  proposed_cost NUMERIC NOT NULL DEFAULT 0,   -- the versioned proposed value
  quantity      INT NOT NULL DEFAULT 1,
  currency      TEXT,
  order_index   INT NOT NULL DEFAULT 0,
  present       BOOLEAN NOT NULL DEFAULT TRUE, -- a line dropped in this version
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (version_id, line_item_id)
);
CREATE INDEX IF NOT EXISTS budget_version_lines_version_idx ON public.budget_version_lines (version_id);
CREATE INDEX IF NOT EXISTS budget_version_lines_line_idx    ON public.budget_version_lines (line_item_id);

-- D-INCOME — versions the CURRENT income columns. NOTE: when the income redesign
-- (Settlement→actuals, formula merch/VIP, per-row currency) lands, this table
-- migrates alongside budget_income.
CREATE TABLE IF NOT EXISTS public.budget_version_income (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id        UUID NOT NULL REFERENCES public.budget_versions(id) ON DELETE CASCADE,
  routing_id        UUID NOT NULL REFERENCES public.routing(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pre_tax_guarantee NUMERIC NOT NULL DEFAULT 0,
  withholding_pct   NUMERIC NOT NULL DEFAULT 0,
  pre_tax_overage   NUMERIC NOT NULL DEFAULT 0,
  merch_income      NUMERIC NOT NULL DEFAULT 0,
  vip_income        NUMERIC NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (version_id, routing_id)
);
CREATE INDEX IF NOT EXISTS budget_version_income_version_idx ON public.budget_version_income (version_id);

-- ============================================================
-- 3. Approver grant (D-APPROVER) — mirror 060_roles_wiring
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_approver_grants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  granted_by   UUID,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- approver = workspace admin OR an explicit grant in my workspace. (No assign-UI
-- this phase — grant rows are inserted by an admin; UI deferred to /settings/team.)
CREATE OR REPLACE FUNCTION public.is_budget_approver()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_workspace_admin()
      OR EXISTS (
        SELECT 1 FROM public.budget_approver_grants g
        WHERE g.user_id = auth.uid()
          AND g.workspace_id = public.get_my_workspace_id()
      );
$$;

-- ============================================================
-- 4. INTEGRITY triggers (DB-level lock — not route-only)
-- ============================================================
-- (a) the proposed snapshot is immutable once its version leaves 'draft'.
CREATE OR REPLACE FUNCTION public.deny_write_on_locked_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  vid uuid;
  vstatus text;
BEGIN
  vid := COALESCE(NEW.version_id, OLD.version_id);
  SELECT status INTO vstatus FROM public.budget_versions WHERE id = vid;
  IF vstatus IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'budget version % is locked (status=%); its proposed snapshot is immutable', vid, vstatus
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_version_lines ON public.budget_version_lines;
CREATE TRIGGER trg_lock_version_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.budget_version_lines
  FOR EACH ROW EXECUTE FUNCTION public.deny_write_on_locked_version();

DROP TRIGGER IF EXISTS trg_lock_version_sections ON public.budget_version_sections;
CREATE TRIGGER trg_lock_version_sections
  BEFORE INSERT OR UPDATE OR DELETE ON public.budget_version_sections
  FOR EACH ROW EXECUTE FUNCTION public.deny_write_on_locked_version();

DROP TRIGGER IF EXISTS trg_lock_version_income ON public.budget_version_income;
CREATE TRIGGER trg_lock_version_income
  BEFORE INSERT OR UPDATE OR DELETE ON public.budget_version_income
  FOR EACH ROW EXECUTE FUNCTION public.deny_write_on_locked_version();

-- (b) only an approver may transition a version into/out of 'approved'.
CREATE OR REPLACE FUNCTION public.guard_version_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status)
     AND ('approved' IN (NEW.status, OLD.status))
     AND NOT public.is_budget_approver() THEN
    RAISE EXCEPTION 'not authorised to approve / unlock budget versions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_version_status ON public.budget_versions;
CREATE TRIGGER trg_guard_version_status
  BEFORE UPDATE ON public.budget_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_version_status_change();

-- ============================================================
-- 5. RLS — workspace-scoped via the canonical helpers
-- ============================================================
ALTER TABLE public.budget_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_version_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_version_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_version_income   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_approver_grants  ENABLE ROW LEVEL SECURITY;

-- versions + snapshots: workspace members read/write (approver gating is enforced
-- by the status-change trigger above + the server endpoints; the immutability
-- trigger protects locked snapshots).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_versions','budget_version_lines','budget_version_sections','budget_version_income']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (workspace_id = public.get_my_workspace_id())', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (workspace_id = public.get_my_workspace_id()) WITH CHECK (workspace_id = public.get_my_workspace_id())', t||'_write', t);
  END LOOP;
END $$;

-- approver grants: members read; only workspace admins grant/revoke (mirror roles_admin_write).
DROP POLICY IF EXISTS budget_approver_grants_select ON public.budget_approver_grants;
CREATE POLICY budget_approver_grants_select
  ON public.budget_approver_grants FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_approver_grants_admin_write ON public.budget_approver_grants;
CREATE POLICY budget_approver_grants_admin_write
  ON public.budget_approver_grants FOR ALL
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- ============================================================
-- 6. BACKFILL — one DRAFT v1 per existing tour from current proposed values
-- ============================================================
-- v1 version per tour that has any budget data (lines or income).
INSERT INTO public.budget_versions (tour_id, workspace_id, version_number, status, note)
SELECT t.id, t.workspace_id, 1, 'draft', 'Backfilled from pre-versioning budget (migration 212)'
FROM public.tours t
WHERE NOT EXISTS (SELECT 1 FROM public.budget_versions v WHERE v.tour_id = t.id)
  AND (
    EXISTS (SELECT 1 FROM public.budget_line_items li WHERE li.tour_id = t.id)
    OR EXISTS (SELECT 1 FROM public.budget_income bi JOIN public.routing r ON r.id = bi.routing_id WHERE r.tour_id = t.id)
  )
ON CONFLICT (tour_id, version_number) DO NOTHING;

-- snapshot sections into v1
INSERT INTO public.budget_version_sections (version_id, section_id, workspace_id, name, sort_order)
SELECT v.id, s.id, s.workspace_id, s.name, s.sort_order
FROM public.budget_versions v
JOIN public.budget_sections s ON s.tour_id = v.tour_id
WHERE v.version_number = 1
ON CONFLICT (version_id, section_id) DO NOTHING;

-- snapshot lines' proposed_cost into v1 (the canonical proposed source going forward)
INSERT INTO public.budget_version_lines
  (version_id, line_item_id, workspace_id, section_id, label, category, proposed_cost, quantity, currency, order_index)
SELECT v.id, li.id, li.workspace_id, li.section_id, li.label, li.category,
       li.proposed_cost, li.quantity, li.currency, li.order_index
FROM public.budget_versions v
JOIN public.budget_line_items li ON li.tour_id = v.tour_id
WHERE v.version_number = 1
ON CONFLICT (version_id, line_item_id) DO NOTHING;

-- snapshot proposed income into v1
INSERT INTO public.budget_version_income
  (version_id, routing_id, workspace_id, pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income)
SELECT v.id, bi.routing_id, bi.workspace_id, bi.pre_tax_guarantee, bi.withholding_pct,
       bi.pre_tax_overage, bi.merch_income, bi.vip_income
FROM public.budget_versions v
JOIN public.routing r ON r.tour_id = v.tour_id
JOIN public.budget_income bi ON bi.routing_id = r.id
WHERE v.version_number = 1
ON CONFLICT (version_id, routing_id) DO NOTHING;

-- ============================================================
-- 7. State-transition RPCs — atomic + approver-gated (one txn each)
-- ============================================================
-- approve: supersede the prior approved THEN approve this one (the partial unique
-- index makes a concurrent double-approve fail). SECURITY DEFINER → one txn;
-- auth.uid()/approver checks still apply.
CREATE OR REPLACE FUNCTION public.approve_budget_version(p_version_id uuid)
RETURNS public.budget_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.budget_versions;
BEGIN
  SELECT * INTO v FROM public.budget_versions WHERE id = p_version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'budget version not found'; END IF;
  IF v.workspace_id IS DISTINCT FROM public.get_my_workspace_id() THEN
    RAISE EXCEPTION 'budget version not in your workspace' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_budget_approver() THEN
    RAISE EXCEPTION 'not authorised to approve budget versions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v.status = 'superseded' THEN RAISE EXCEPTION 'cannot approve a superseded version'; END IF;
  UPDATE public.budget_versions
     SET status = 'superseded', updated_at = now()
   WHERE tour_id = v.tour_id AND status = 'approved' AND id <> p_version_id;
  UPDATE public.budget_versions
     SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
   WHERE id = p_version_id
  RETURNING * INTO v;
  RETURN v;
END;
$$;

-- unlock: approved -> draft (same number), editable again.
CREATE OR REPLACE FUNCTION public.unlock_budget_version(p_version_id uuid)
RETURNS public.budget_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.budget_versions;
BEGIN
  SELECT * INTO v FROM public.budget_versions WHERE id = p_version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'budget version not found'; END IF;
  IF v.workspace_id IS DISTINCT FROM public.get_my_workspace_id() THEN
    RAISE EXCEPTION 'budget version not in your workspace' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_budget_approver() THEN
    RAISE EXCEPTION 'not authorised to unlock budget versions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v.status <> 'approved' THEN RAISE EXCEPTION 'only an approved version can be unlocked'; END IF;
  UPDATE public.budget_versions
     SET status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = now()
   WHERE id = p_version_id
  RETURNING * INTO v;
  RETURN v;
END;
$$;

-- amend: clone the latest approved into a NEW draft v(n+1); prior approved -> superseded.
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
  INSERT INTO public.budget_version_income (version_id, routing_id, workspace_id, pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income)
  SELECT v.id, routing_id, workspace_id, pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income FROM public.budget_version_income WHERE version_id = src.id;
  -- supersede the prior approved AFTER cloning (so the one-approved index never sees two)
  UPDATE public.budget_versions SET status = 'superseded', updated_at = now() WHERE id = src.id;
  RETURN v;
END;
$$;

-- ============================================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.amend_budget_version(uuid);
-- DROP FUNCTION IF EXISTS public.unlock_budget_version(uuid);
-- DROP FUNCTION IF EXISTS public.approve_budget_version(uuid);
-- DROP TRIGGER IF EXISTS trg_guard_version_status ON public.budget_versions;
-- DROP TRIGGER IF EXISTS trg_lock_version_income ON public.budget_version_income;
-- DROP TRIGGER IF EXISTS trg_lock_version_sections ON public.budget_version_sections;
-- DROP TRIGGER IF EXISTS trg_lock_version_lines ON public.budget_version_lines;
-- DROP FUNCTION IF EXISTS public.guard_version_status_change();
-- DROP FUNCTION IF EXISTS public.deny_write_on_locked_version();
-- DROP FUNCTION IF EXISTS public.is_budget_approver();
-- DROP TABLE IF EXISTS public.budget_approver_grants;
-- DROP TABLE IF EXISTS public.budget_version_income;
-- DROP TABLE IF EXISTS public.budget_version_lines;
-- DROP TABLE IF EXISTS public.budget_version_sections;
-- DROP TABLE IF EXISTS public.budget_versions;
