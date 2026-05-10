-- ============================================
-- LOWPASS — Permissions RLS helpers + policy updates (Sprint 9 §2)
-- Migration 079
--
-- This migration completes the permissions cutover started by
-- 078. 078 added new tables + columns using the EXISTING
-- is_workspace_admin() helper (which still read profiles.role_id
-- -> roles.is_god). 079 atomically:
--
--   1. Adds new helpers: get_my_role(), has_tag(),
--      has_permission(), can_access().
--   2. Rewrites is_workspace_admin() to read
--      workspace_members.role = 'admin'. Every existing policy
--      that calls is_workspace_admin() picks up the new
--      semantics for free.
--   3. Rewrites get_my_workspace_id() to verify the caller's
--      profiles.workspace_id is a valid workspace_members row.
--      Fails closed (returns NULL) on drift.
--   4. Rewrites RLS on strict-gated tables to call can_access()
--      so readonly users without explicit grants see nothing on
--      these tables, while admins/managers continue to have
--      full access via the role check inside can_access().
--
-- Tables strict-gated in this migration (resource_id mapping):
--   budget_line_items   -> 'budget.line_items'
--   expense_receipts    -> 'budget.receipts'
--   expenses            -> 'budget.receipts'
--   personnel_rates     -> 'budget.payroll'
--   payroll_entries     -> 'budget.payroll'
--   deal_memos          -> 'budget.deal_memos'
--   budget_commissions  -> 'budget.commissions'
--   budget_income       -> 'budget.summary'
--   settlement          -> 'budget.summary'
--
-- Tables NOT touched (membership-trusted, existing policies
-- keep working because get_my_workspace_id() now verifies
-- membership):
--   profiles, workspaces, roles, artists, tours, routing,
--   venues, advance_*, rider_packs, rider_folders, persons,
--   tour_personnel, personnel, file_references, notifications,
--   bug_reports, channel_list, etc.
--
-- Personnel / tour_personnel compensation fields:
--   These tables stay membership-trusted because the row carries
--   both sensitive (rate_amount, commission_rates) and non-
--   sensitive (name, role) fields and Postgres RLS is row-level,
--   not column-level. The Phase 6 API layer redacts compensation
--   fields based on can_access('page',
--   'operations.personnel.compensation', 'read'). Future sprints
--   may split into a separate compensation table for column-level
--   strictness.
--
-- Idempotency: CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS
-- + recreate. Safe to re-run.
--
-- Rollback risk: 079 changes is_workspace_admin() semantics.
-- Pre-079, admins were profiles.role_id->roles.is_god=TRUE.
-- Post-079, admins are workspace_members.role='admin'. The 078
-- backfill seeded every existing profile.workspace_id as
-- workspace_members.role='admin', so existing admins remain
-- admins. Workspace owners additionally get is_workspace_owner=
-- TRUE in 078's backfill. Rolling back 079 restores the prior
-- helpers; no data loss.
-- ============================================

-- ============================================
-- Helpers
-- ============================================

-- get_my_workspace_id() — returns active workspace, but only if
-- the caller has a workspace_members row for it. Fails closed
-- (NULL) if profile.workspace_id is set to a workspace the
-- user isn't a member of (e.g. mid-switch drift).
CREATE OR REPLACE FUNCTION public.get_my_workspace_id()
RETURNS UUID AS $$
  SELECT p.workspace_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.user_id = p.id
        AND m.workspace_id = p.workspace_id
    )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_my_workspace_id() IS
  'Returns the caller''s active workspace_id (profiles.workspace_id) only if a workspace_members row exists. Sprint 9 — fail-closed under multi-workspace.';

-- get_my_role() — returns 'admin' | 'manager' | 'readonly' for
-- the active workspace. NULL if no membership.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT m.role
  FROM public.profiles p
  JOIN public.workspace_members m
    ON m.user_id = p.id AND m.workspace_id = p.workspace_id
  WHERE p.id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_my_role() IS
  'Returns the caller''s workspace_members.role for the active workspace. Sprint 9 §2.';

-- is_workspace_admin() rewritten to read workspace_members.
-- Replaces the migration-034 body that read roles.is_god via
-- profiles.role_id. Every existing policy that calls this
-- helper picks up the new semantics automatically.
CREATE OR REPLACE FUNCTION public.is_workspace_admin()
RETURNS BOOLEAN AS $$
  SELECT public.get_my_role() = 'admin'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.is_workspace_admin() IS
  'Returns true if the caller is an admin of the active workspace. Sprint 9 §2 — rewritten from roles.is_god to workspace_members.role.';

-- has_tag(tag_name) — caller has the tag in active workspace.
CREATE OR REPLACE FUNCTION public.has_tag(p_tag_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.workspace_members m
      ON m.user_id = p.id AND m.workspace_id = p.workspace_id
    JOIN public.workspace_member_tags t
      ON t.member_id = m.id AND t.tag_name = p_tag_name
    WHERE p.id = auth.uid()
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.has_tag(TEXT) IS
  'Returns true if the caller has the given tag in their active workspace. Sprint 9 §2.';

-- has_permission — explicit grant in permission_grants. Checks
-- both user-direct and tag-mediated grants. Write grant
-- implicitly satisfies read.
CREATE OR REPLACE FUNCTION public.has_permission(
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_permission TEXT
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.permission_grants g
    WHERE g.workspace_id = public.get_my_workspace_id()
      AND g.resource_type = p_resource_type
      AND g.resource_id = p_resource_id
      AND (
        g.permission = p_permission
        OR (p_permission = 'read' AND g.permission = 'write')
      )
      AND (
        (g.subject_type = 'user' AND g.subject_id = auth.uid()::text)
        OR (g.subject_type = 'tag' AND public.has_tag(g.subject_id))
      )
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.has_permission(TEXT, TEXT, TEXT) IS
  'Returns true if the caller has an explicit permission_grants row for the given resource (user-direct or tag-mediated). Write implicitly satisfies read. Sprint 9 §2.';

-- can_access — the bundled helper RLS policies call.
-- Admin/manager: always true. Readonly: requires has_permission.
-- NULL role (no membership): always false.
CREATE OR REPLACE FUNCTION public.can_access(
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_permission TEXT
)
RETURNS BOOLEAN AS $$
  SELECT
    public.get_my_role() IN ('admin', 'manager')
    OR public.has_permission(p_resource_type, p_resource_id, p_permission)
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.can_access(TEXT, TEXT, TEXT) IS
  'Bundled access check: admin/manager always pass; readonly users require has_permission. RLS policies call this for strict-gated tables. Sprint 9 §2.';

-- ============================================
-- RLS — strict-gated tables
-- ============================================

-- ----------------------------------------------
-- budget_line_items -> 'budget.line_items'
-- ----------------------------------------------
DROP POLICY IF EXISTS "Users can view workspace line items" ON public.budget_line_items;
DROP POLICY IF EXISTS "Users can manage workspace line items" ON public.budget_line_items;
DROP POLICY IF EXISTS "budget_line_items_select" ON public.budget_line_items;
DROP POLICY IF EXISTS "budget_line_items_insert" ON public.budget_line_items;
DROP POLICY IF EXISTS "budget_line_items_update" ON public.budget_line_items;
DROP POLICY IF EXISTS "budget_line_items_delete" ON public.budget_line_items;

CREATE POLICY "budget_line_items_select" ON public.budget_line_items
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.line_items', 'read')
  );
CREATE POLICY "budget_line_items_insert" ON public.budget_line_items
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.line_items', 'write')
  );
CREATE POLICY "budget_line_items_update" ON public.budget_line_items
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.line_items', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.line_items', 'write')
  );
CREATE POLICY "budget_line_items_delete" ON public.budget_line_items
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.line_items', 'write')
  );

-- ----------------------------------------------
-- expense_receipts -> 'budget.receipts'
-- ----------------------------------------------
DROP POLICY IF EXISTS "Users can view workspace receipts" ON public.expense_receipts;
DROP POLICY IF EXISTS "Users can manage workspace receipts" ON public.expense_receipts;
DROP POLICY IF EXISTS "expense_receipts_select" ON public.expense_receipts;
DROP POLICY IF EXISTS "expense_receipts_insert" ON public.expense_receipts;
DROP POLICY IF EXISTS "expense_receipts_update" ON public.expense_receipts;
DROP POLICY IF EXISTS "expense_receipts_delete" ON public.expense_receipts;

CREATE POLICY "expense_receipts_select" ON public.expense_receipts
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.receipts', 'read')
  );
CREATE POLICY "expense_receipts_insert" ON public.expense_receipts
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.receipts', 'write')
  );
CREATE POLICY "expense_receipts_update" ON public.expense_receipts
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.receipts', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.receipts', 'write')
  );
CREATE POLICY "expense_receipts_delete" ON public.expense_receipts
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.receipts', 'write')
  );

-- ----------------------------------------------
-- expenses -> 'budget.receipts' (canonical receipts table from 055)
-- ----------------------------------------------
DROP POLICY IF EXISTS expenses_select ON public.expenses;
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
DROP POLICY IF EXISTS expenses_update ON public.expenses;
DROP POLICY IF EXISTS expenses_delete ON public.expenses;

CREATE POLICY expenses_select ON public.expenses
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.receipts', 'read')
  );
CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.receipts', 'write')
  );
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.receipts', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.receipts', 'write')
  );
CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.receipts', 'write')
    AND public.is_workspace_admin()
  );

-- ----------------------------------------------
-- personnel_rates -> 'budget.payroll'
-- ----------------------------------------------
DROP POLICY IF EXISTS "Users can view workspace personnel rates" ON public.personnel_rates;
DROP POLICY IF EXISTS "Users can manage workspace personnel rates" ON public.personnel_rates;
DROP POLICY IF EXISTS "personnel_rates_select" ON public.personnel_rates;
DROP POLICY IF EXISTS "personnel_rates_insert" ON public.personnel_rates;
DROP POLICY IF EXISTS "personnel_rates_update" ON public.personnel_rates;
DROP POLICY IF EXISTS "personnel_rates_delete" ON public.personnel_rates;

CREATE POLICY "personnel_rates_select" ON public.personnel_rates
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.payroll', 'read')
  );
CREATE POLICY "personnel_rates_insert" ON public.personnel_rates
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.payroll', 'write')
  );
CREATE POLICY "personnel_rates_update" ON public.personnel_rates
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.payroll', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.payroll', 'write')
  );
CREATE POLICY "personnel_rates_delete" ON public.personnel_rates
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.payroll', 'write')
  );

-- ----------------------------------------------
-- payroll_entries -> 'budget.payroll'
-- ----------------------------------------------
DROP POLICY IF EXISTS "Users can view workspace payroll" ON public.payroll_entries;
DROP POLICY IF EXISTS "Users can manage workspace payroll" ON public.payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_select" ON public.payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_insert" ON public.payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_update" ON public.payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_delete" ON public.payroll_entries;

CREATE POLICY "payroll_entries_select" ON public.payroll_entries
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.payroll', 'read')
  );
CREATE POLICY "payroll_entries_insert" ON public.payroll_entries
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.payroll', 'write')
  );
CREATE POLICY "payroll_entries_update" ON public.payroll_entries
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.payroll', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.payroll', 'write')
  );
CREATE POLICY "payroll_entries_delete" ON public.payroll_entries
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.payroll', 'write')
  );

-- ----------------------------------------------
-- deal_memos -> 'budget.deal_memos'
-- ----------------------------------------------
DROP POLICY IF EXISTS deal_memos_select ON public.deal_memos;
DROP POLICY IF EXISTS deal_memos_insert ON public.deal_memos;
DROP POLICY IF EXISTS deal_memos_update ON public.deal_memos;
DROP POLICY IF EXISTS deal_memos_delete ON public.deal_memos;

CREATE POLICY deal_memos_select ON public.deal_memos
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.deal_memos', 'read')
  );
CREATE POLICY deal_memos_insert ON public.deal_memos
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.deal_memos', 'write')
  );
CREATE POLICY deal_memos_update ON public.deal_memos
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.deal_memos', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.deal_memos', 'write')
  );
CREATE POLICY deal_memos_delete ON public.deal_memos
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.deal_memos', 'write')
    AND public.is_workspace_admin()
  );

-- ----------------------------------------------
-- budget_commissions -> 'budget.commissions' (admin-only via role)
-- ----------------------------------------------
DROP POLICY IF EXISTS "Users can view workspace commissions" ON public.budget_commissions;
DROP POLICY IF EXISTS "Users can manage workspace commissions" ON public.budget_commissions;
DROP POLICY IF EXISTS "budget_commissions_select" ON public.budget_commissions;
DROP POLICY IF EXISTS "budget_commissions_insert" ON public.budget_commissions;
DROP POLICY IF EXISTS "budget_commissions_update" ON public.budget_commissions;
DROP POLICY IF EXISTS "budget_commissions_delete" ON public.budget_commissions;

CREATE POLICY "budget_commissions_select" ON public.budget_commissions
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.commissions', 'read')
  );
CREATE POLICY "budget_commissions_insert" ON public.budget_commissions
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.commissions', 'write')
  );
CREATE POLICY "budget_commissions_update" ON public.budget_commissions
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.commissions', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.commissions', 'write')
  );
CREATE POLICY "budget_commissions_delete" ON public.budget_commissions
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

-- ----------------------------------------------
-- budget_income -> 'budget.summary'
-- ----------------------------------------------
DROP POLICY IF EXISTS "Users can view workspace income" ON public.budget_income;
DROP POLICY IF EXISTS "Users can manage workspace income" ON public.budget_income;
DROP POLICY IF EXISTS "budget_income_select" ON public.budget_income;
DROP POLICY IF EXISTS "budget_income_insert" ON public.budget_income;
DROP POLICY IF EXISTS "budget_income_update" ON public.budget_income;
DROP POLICY IF EXISTS "budget_income_delete" ON public.budget_income;

CREATE POLICY "budget_income_select" ON public.budget_income
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'read')
  );
CREATE POLICY "budget_income_insert" ON public.budget_income
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  );
CREATE POLICY "budget_income_update" ON public.budget_income
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  );
CREATE POLICY "budget_income_delete" ON public.budget_income
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  );

-- ----------------------------------------------
-- settlement -> 'budget.summary'
-- ----------------------------------------------
DROP POLICY IF EXISTS "Users can view workspace settlement" ON public.settlement;
DROP POLICY IF EXISTS "Users can manage workspace settlement" ON public.settlement;
DROP POLICY IF EXISTS "settlement_select" ON public.settlement;
DROP POLICY IF EXISTS "settlement_insert" ON public.settlement;
DROP POLICY IF EXISTS "settlement_update" ON public.settlement;
DROP POLICY IF EXISTS "settlement_delete" ON public.settlement;

CREATE POLICY "settlement_select" ON public.settlement
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'read')
  );
CREATE POLICY "settlement_insert" ON public.settlement
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  );
CREATE POLICY "settlement_update" ON public.settlement
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  );
CREATE POLICY "settlement_delete" ON public.settlement
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
    AND public.is_workspace_admin()
  );

-- ============================================
-- DOWN (manual rollback — uncomment to roll back)
-- ============================================
-- Restore the migration-034 is_workspace_admin body and the
-- migration-004 get_my_workspace_id body. Drop the new helpers.
-- The strict-gated tables' policies should be reverted to their
-- workspace-membership-only shape — see each table's prior
-- migration for the original policy text.
--
-- DROP POLICY IF EXISTS settlement_delete ON public.settlement;
-- DROP POLICY IF EXISTS settlement_update ON public.settlement;
-- DROP POLICY IF EXISTS settlement_insert ON public.settlement;
-- DROP POLICY IF EXISTS settlement_select ON public.settlement;
-- (...and the same for budget_income, budget_commissions,
-- deal_memos, payroll_entries, personnel_rates, expenses,
-- expense_receipts, budget_line_items)
--
-- DROP FUNCTION IF EXISTS public.can_access(TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.has_permission(TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.has_tag(TEXT);
-- DROP FUNCTION IF EXISTS public.get_my_role();
--
-- CREATE OR REPLACE FUNCTION public.is_workspace_admin()
-- RETURNS BOOLEAN AS $$
--   SELECT COALESCE(r.is_god, FALSE)
--   FROM profiles p
--   LEFT JOIN roles r ON r.id = p.role_id
--   WHERE p.id = auth.uid()
-- $$ LANGUAGE sql STABLE SECURITY DEFINER;
--
-- CREATE OR REPLACE FUNCTION public.get_my_workspace_id()
-- RETURNS UUID AS $$
--   SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
-- $$ LANGUAGE sql STABLE SECURITY DEFINER;
