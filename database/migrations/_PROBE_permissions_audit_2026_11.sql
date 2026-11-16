-- ============================================================================
-- _PROBE_permissions_audit_2026_11.sql — READ-ONLY. Changes nothing.
--
-- Confirms the database half of the Nov 2026 permissions audit against the
-- LIVE database (the migration files have drifted from it before). Paste into
-- the Supabase SQL editor; it returns ONE table: check · status · detail.
--
--   status  HOLE    = the finding is live, as the audit describes
--           OK      = live is safe on this point
--           INFO    = context, no verdict
--
-- No personal data is returned: counts only, never values.
-- ============================================================================

WITH pol AS (
  SELECT n.nspname AS sch, c.relname AS tbl, p.polname AS name,
         CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
                       WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd,
         coalesce(pg_get_expr(p.polqual, p.polrelid), '') AS using_expr,
         coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS check_expr
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
),
checks AS (

  -- 1. Can a user move their own profile to another workspace?
  SELECT 1 AS ord, 'profiles: self-update can change workspace_id' AS check_name,
         CASE WHEN EXISTS (
                SELECT 1 FROM pol WHERE sch = 'public' AND tbl = 'profiles' AND cmd IN ('UPDATE', 'ALL')
                  AND using_expr ILIKE '%auth.uid()%' AND using_expr NOT ILIKE '%is_workspace_admin%'
                  AND check_expr NOT ILIKE '%workspace_id%')
              AND NOT EXISTS (
                SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                WHERE c.relname = 'profiles' AND NOT t.tgisinternal
                  AND pg_get_triggerdef(t.oid) ILIKE '%workspace%')
              THEN 'HOLE' ELSE 'OK' END AS status,
         coalesce((SELECT string_agg(name || ' [' || cmd || '] using(' || using_expr || ') check(' || check_expr || ')', ' | ')
                   FROM pol WHERE sch = 'public' AND tbl = 'profiles' AND cmd IN ('UPDATE', 'ALL')), 'no update policy') AS detail

  -- 2. rider-assets: any signed-in user of any workspace?
  UNION ALL
  SELECT 2, 'storage rider-assets: cross-workspace read / write / delete',
         CASE WHEN EXISTS (SELECT 1 FROM pol WHERE sch = 'storage' AND tbl = 'objects'
                           AND (using_expr || check_expr) ILIKE '%rider-assets%'
                           AND (using_expr || check_expr) NOT ILIKE '%get_my_workspace_id%'
                           AND (using_expr || check_expr) NOT ILIKE '%foldername%')
              THEN 'HOLE' ELSE 'OK' END,
         coalesce((SELECT string_agg(name || ' [' || cmd || ']: ' || left(using_expr || check_expr, 140), ' | ')
                   FROM pol WHERE sch = 'storage' AND tbl = 'objects' AND (using_expr || check_expr) ILIKE '%rider-assets%'), 'no policies')

  -- 3. advance-files: public bucket, any signed-in delete?
  UNION ALL
  SELECT 3, 'storage advance-files: public bucket / any signed-in write',
         CASE WHEN coalesce((SELECT public FROM storage.buckets WHERE id = 'advance-files'), false)
                OR EXISTS (SELECT 1 FROM pol WHERE sch = 'storage' AND tbl = 'objects'
                           AND (using_expr || check_expr) ILIKE '%advance-files%'
                           AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                           AND (using_expr || check_expr) NOT ILIKE '%get_my_workspace_id%')
              THEN 'HOLE' ELSE 'OK' END,
         'public=' || coalesce((SELECT public::text FROM storage.buckets WHERE id = 'advance-files'), 'no bucket')
           || ' · objects=' || (SELECT count(*) FROM storage.objects WHERE bucket_id = 'advance-files')::text

  -- 4. Every bucket and whether it is public.
  UNION ALL
  SELECT 4, 'storage: bucket ' || id, CASE WHEN public THEN 'INFO' ELSE 'OK' END,
         'public=' || public::text || ' · objects=' || (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = b.id)::text
  FROM storage.buckets b

  -- 5. tour-files: can any member (readonly included) delete?
  UNION ALL
  SELECT 5, 'storage tour-files: delete without a role check',
         CASE WHEN EXISTS (SELECT 1 FROM pol WHERE sch = 'storage' AND tbl = 'objects' AND cmd IN ('DELETE', 'ALL')
                           AND using_expr ILIKE '%tour-files%'
                           AND using_expr NOT ILIKE '%is_workspace_admin%' AND using_expr NOT ILIKE '%can_access%'
                           AND using_expr NOT ILIKE '%get_my_role%')
              THEN 'HOLE' ELSE 'OK' END,
         coalesce((SELECT string_agg(name || ' [' || cmd || ']', ' | ') FROM pol
                   WHERE sch = 'storage' AND tbl = 'objects' AND (using_expr || check_expr) ILIKE '%tour-files%'), 'no policies')

  -- 6. Money tables: any policy without the grant check would OR past it
  --    (budget_settings SELECT is workspace-wide by design — migration 264).
  UNION ALL
  SELECT 6, 'money table ' || t.tbl || ': policy without the grant check',
         CASE WHEN EXISTS (SELECT 1 FROM pol p WHERE p.sch = 'public' AND p.tbl = t.tbl
                           AND (p.using_expr || p.check_expr) NOT ILIKE '%can_access%'
                           AND (p.using_expr || p.check_expr) NOT ILIKE '%is_workspace_admin%'
                           AND NOT (t.tbl = 'budget_settings' AND p.cmd = 'SELECT'))
              THEN 'HOLE' ELSE 'OK' END,
         coalesce((SELECT string_agg(p.name || ' [' || p.cmd || ']', ' | ') FROM pol p
                   WHERE p.sch = 'public' AND p.tbl = t.tbl AND (p.using_expr || p.check_expr) NOT ILIKE '%can_access%'),
                  'every policy uses can_access')
  FROM (VALUES ('budget_line_items'), ('budget_income'), ('budget_commissions'), ('settlement'),
               ('expense_receipts'), ('payroll_entries'), ('personnel_rates'), ('deal_memos'),
               ('budget_settings')) AS t(tbl)
  WHERE to_regclass('public.' || t.tbl) IS NOT NULL

  -- 7. AI index: does it hold money and who can read it?
  UNION ALL
  SELECT 7, 'rag_chunks (AI Ask index): readable by every member',
         CASE WHEN to_regclass('public.rag_chunks') IS NULL THEN 'OK'
              WHEN EXISTS (SELECT 1 FROM pol WHERE sch = 'public' AND tbl = 'rag_chunks' AND cmd IN ('SELECT', 'ALL')
                           AND using_expr NOT ILIKE '%can_access%')
              THEN 'HOLE' ELSE 'OK' END,
         CASE WHEN to_regclass('public.rag_chunks') IS NULL THEN 'table not present — AI Ask index never created'
              ELSE 'approx rows: ' || coalesce((SELECT reltuples::bigint::text FROM pg_class WHERE oid = to_regclass('public.rag_chunks')), '?')
                   || ' (run: SELECT source_kind, count(*) FROM rag_chunks GROUP BY 1; for the split)' END

  -- 8. Crew passports stored readable by every member.
  UNION ALL
  SELECT 8, 'personnel: passport numbers readable by every member',
         CASE WHEN (SELECT count(*) FROM public.personnel WHERE coalesce(passport_info ->> 'number', '') <> '') > 0
                AND EXISTS (SELECT 1 FROM pol WHERE sch = 'public' AND tbl = 'personnel' AND cmd IN ('SELECT', 'ALL')
                            AND using_expr NOT ILIKE '%can_access%' AND using_expr NOT ILIKE '%is_workspace_admin%')
              THEN 'HOLE' ELSE 'OK' END,
         (SELECT count(*) FROM public.personnel WHERE coalesce(passport_info ->> 'number', '') <> '')::text
           || ' people with a passport number on file (count only)'

  -- 9. AI spending limits writable by each workspace's own admin.
  UNION ALL
  SELECT 9, 'ai_usage_limits: a workspace admin can raise their own AI budget',
         CASE WHEN EXISTS (SELECT 1 FROM pol WHERE sch = 'public' AND tbl = 'ai_usage_limits' AND cmd IN ('INSERT', 'UPDATE', 'ALL')
                           AND (using_expr || check_expr) NOT ILIKE '%site_admin%')
              THEN 'HOLE' ELSE 'OK' END,
         coalesce((SELECT string_agg(name || ' [' || cmd || ']', ' | ') FROM pol WHERE sch = 'public' AND tbl = 'ai_usage_limits'), 'no policies')

  -- 10. Tables with RLS switched OFF in public (anyone with the browser key reads them).
  UNION ALL
  SELECT 10, 'public table without RLS: ' || c.relname, 'HOLE', 'row level security is disabled'
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity

  -- 11. SECURITY DEFINER functions callable from the browser (context for review).
  UNION ALL
  SELECT 11, 'browser-callable SECURITY DEFINER fn: ' || p.proname, 'INFO', pg_get_function_identity_arguments(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
)
SELECT check_name, status, detail FROM checks ORDER BY ord, check_name;
