-- ============================================================================
-- LOWPASS — PERMISSIONS P0 PROBE v2. Read-only. ONE statement, one result grid.
--
-- v1 had two bugs, both corrected here:
--   1. It was three statements. The Supabase SQL editor renders only the LAST
--      result set, so P0-A and P0-B ran invisibly. Everything is now a single
--      UNION ALL returning three text columns.
--   2. The gate classification read only pol.polqual. INSERT policies carry
--      their predicate in polwithcheck and have polqual = NULL, so every
--      INSERT policy was misfiled as "other / self-scoped" — which is why that
--      bucket returned 94 tables. Now reads coalesce(polqual, polwithcheck).
--
-- Read the `finding` column first. Rows starting "P0-A" or "P0-B" are live
-- holes. If neither appears, both suspicions are clear.
-- ============================================================================

with pol as (
  select
    c.relname                                                as table_name,
    n.nspname                                                as schema_name,
    p.polname                                                as policy_name,
    case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                  when 'w' then 'UPDATE' when 'd' then 'DELETE'
                  when '*' then 'ALL'  end                   as command,
    coalesce(
      pg_get_expr(p.polqual,      p.polrelid),
      pg_get_expr(p.polwithcheck, p.polrelid)
    )                                                        as expr
  from pg_policy p
  join pg_class     c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
)

-- ── P0-A — money tables whose role gate may be bypassed ────────────────────
-- 017 created <table>_workspace as FOR ALL with tenancy only. 079 added
-- can_access() policies but never dropped the 017 ones. RLS policies are
-- PERMISSIVE and OR'd, so a surviving tenancy-only policy nullifies the gate.
-- Expect ZERO rows. Any row = readonly members can reach that table today.
select
  'P0-A BYPASS · ' || table_name || ' · ' || command  as finding,
  policy_name                                          as detail,
  left(coalesce(expr, '(no predicate)'), 200)          as predicate
from pol
where schema_name = 'public'
  and table_name in (
    'budget_line_items','budget_income','budget_commissions','budget_settings',
    'expense_receipts','expenses','payroll_entries','personnel_rates',
    'deal_memos','settlement'
  )
  and coalesce(expr, '') not like '%can_access%'
  and coalesce(expr, '') not like '%is_workspace_admin%'

union all

-- ── P0-B — storage buckets readable beyond their workspace ─────────────────
-- A policy that constrains only on bucket_id + auth.uid() IS NOT NULL is
-- readable by every authenticated account on the platform, any workspace.
-- One policy (016) may carry no auth predicate at all.
select
  'P0-B STORAGE · ' || command                         as finding,
  policy_name                                          as detail,
  left(coalesce(expr, '(no predicate)'), 200)          as predicate
from pol
where schema_name = 'storage'
  and table_name = 'objects'
  and coalesce(expr, '') not like '%workspace%'
  and coalesce(expr, '') not like '%foldername%'

union all

-- ── CONTEXT — the corrected convergence surface ────────────────────────────
select
  'CONTEXT · ' || gate_kind                            as finding,
  policy_clauses::text || ' clauses'                   as detail,
  tables::text || ' tables'                            as predicate
from (
  select
    case
      when expr like '%can_access%'          then 'can_access (role or grant)'
      when expr like '%is_workspace_admin%'  then 'is_workspace_admin (admin only)'
      when expr like '%get_my_workspace_id%' then 'TENANCY ONLY — no role at all'
      when expr is null                      then 'no predicate'
      else 'other / self-scoped'
    end                          as gate_kind,
    count(*)                     as policy_clauses,
    count(distinct table_name)   as tables
  from pol
  where schema_name = 'public'
  group by 1
) s

order by 1;
