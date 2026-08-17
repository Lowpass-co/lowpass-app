-- ============================================================================
-- 264_close_the_money_and_storage_holes.sql
--
-- P0-A + P0-B. Both CONFIRMED against live pg_policy on 2026-08-14, not
-- inferred from the migration files.
--
-- P0-A — THE MONEY GATE HAS NEVER RUN.
--   017 created <table>_workspace as FOR ALL USING (workspace_id =
--   get_my_workspace_id()) — tenancy, no role. 079 later added can_access()
--   policies to the same tables and dropped the older policy NAMES it knew
--   about, but never dropped the _workspace ones. RLS policies are PERMISSIVE
--   and OR'd, so the tenancy policy satisfies every request on its own and the
--   can_access gate is dead weight. Eight tables confirmed bypassed.
--
--   This is reachable, not theoretical: the app ships a browser Supabase
--   client, so a readonly member's own session can write these tables directly.
--   requireWrite guards the API; nothing guards that path but RLS.
--
-- P0-B — THREE BUCKETS ARE CROSS-TENANT, INCLUDING DELETE.
--   budget-receipts, budget-files and receipts gate on
--   `auth.uid() IS NOT NULL` alone. Any authenticated account in ANY workspace
--   can read, overwrite and delete another workspace's financial documents.
--
-- NOT touched here, deliberately: avatars and artist-assets are public-read by
-- design (public URLs, PDF embedding). advance-files probed clean. bug-reports
-- is correctly scoped to site-admin-or-reporter.
--
-- IDEMPOTENT. Every step guarded; re-running is a no-op.
-- ASSERT-BEFORE-DROP: no policy is removed until its replacement is proven
-- present, so a partial paste cannot lock anyone out of a money table.
-- ============================================================================


-- ── 1. P0-A: drop the orphaned tenancy policies, but only where a real gate
--    already exists to take over. If one is missing we ABORT rather than
--    silently leave a table with no policy at all — an empty policy set denies
--    everything, which would take Budget down for every user including Adam.
DO $$
DECLARE
  t              TEXT;
  v_can_access   INT;
  v_dropped      INT := 0;
  -- budget_settings is deliberately NOT in this list: it has NO can_access
  -- policy to inherit. It is handled separately in step 2.
  v_tables TEXT[] := ARRAY[
    'budget_commissions', 'budget_income', 'budget_line_items',
    'expense_receipts', 'payroll_entries', 'personnel_rates', 'settlement'
  ];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    SELECT count(*) INTO v_can_access
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t
      AND coalesce(
            pg_get_expr(p.polqual, p.polrelid),
            pg_get_expr(p.polwithcheck, p.polrelid)
          ) LIKE '%can_access%';

    IF v_can_access = 0 THEN
      RAISE EXCEPTION
        'ABORT: %.% has no can_access policy to inherit. Dropping its tenancy policy would deny all access. Investigate before re-running 264.',
        'public', t;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_workspace', t);
    v_dropped := v_dropped + 1;
  END LOOP;

  RAISE NOTICE '264 step 1: % tenancy-only money policies dropped (or already absent).', v_dropped;
END $$;


-- ── 2. budget_settings — the odd one out. It has FOUR tenancy-only policies
--    and NO can_access policy at all, so we must CREATE the gate before
--    removing anything.
--
--    DESIGN NOTE, and Adam should read this rather than inherit it:
--    SELECT is left workspace-wide on purpose. budget_settings holds the tour's
--    currency and basis settings, which non-money surfaces read for display;
--    gating reads risks breaking unrelated pages for readonly members, and a
--    currency code is not sensitive. WRITES are gated — that is the actual hole.
--    If Adam wants reads gated too, change the SELECT policy to can_access and
--    re-paste; it is a two-line edit.
DROP POLICY IF EXISTS budget_settings_insert_gated ON public.budget_settings;
CREATE POLICY budget_settings_insert_gated ON public.budget_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  );

DROP POLICY IF EXISTS budget_settings_update_gated ON public.budget_settings;
CREATE POLICY budget_settings_update_gated ON public.budget_settings
  FOR UPDATE TO authenticated
  USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  )
  WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  );

DROP POLICY IF EXISTS budget_settings_delete_gated ON public.budget_settings;
CREATE POLICY budget_settings_delete_gated ON public.budget_settings
  FOR DELETE TO authenticated
  USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'budget.summary', 'write')
  );

-- Reads stay tenancy-scoped (see design note above). Recreated by name so the
-- surviving policy is unambiguous rather than whichever of the old ones won.
DROP POLICY IF EXISTS budget_settings_select_tenancy ON public.budget_settings;
CREATE POLICY budget_settings_select_tenancy ON public.budget_settings
  FOR SELECT TO authenticated
  USING (workspace_id = public.get_my_workspace_id());

-- Only now remove the ungated originals.
DROP POLICY IF EXISTS budget_settings_workspace ON public.budget_settings;
DROP POLICY IF EXISTS budget_settings_select    ON public.budget_settings;
DROP POLICY IF EXISTS budget_settings_insert    ON public.budget_settings;
DROP POLICY IF EXISTS budget_settings_update    ON public.budget_settings;
DROP POLICY IF EXISTS budget_settings_delete    ON public.budget_settings;


-- ── 3. P0-B: scope the three exposed buckets.
--
--    Path conventions differ by bucket and this is load-bearing — a policy that
--    does not match the real upload path silently breaks uploads:
--
--      receipts       {workspace_id}/{expenseId}/{file}          → folder[1] is the workspace
--      budget-files   {workspace_id}/line-items/{id}/{file}      → folder[1] is the workspace
--      budget-receipts  tours/{tourId}/receipts/{id}/{file}      → folder[1] is LITERAL 'tours'
--                       settlement/{tourId}/{routingId}/…/{file} → folder[1] is LITERAL 'settlement'
--
--    So budget-receipts cannot be folder-scoped. Its tour id sits at segment 2
--    in BOTH shapes, so we join through public.tours instead — which scopes it
--    correctly with no file migration. Compared as text, never cast to uuid, so
--    a malformed path fails closed instead of raising.

-- The budget-receipts helper. SECURITY DEFINER alongside get_my_workspace_id(),
-- for the same reason it is: the policy must read public.tours, and doing that
-- inline from a storage.objects policy is how 004_fix_rls_recursion.sql
-- happened. Text comparison, never a uuid cast — a malformed or legacy path
-- returns false rather than raising, so it fails CLOSED.
CREATE OR REPLACE FUNCTION public.storage_tour_in_my_workspace(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tours t
    WHERE t.id::text = (storage.foldername(p_name))[2]
      AND t.workspace_id = public.get_my_workspace_id()
  )
$$;

COMMENT ON FUNCTION public.storage_tour_in_my_workspace(TEXT) IS
  'Scopes budget-receipts objects by workspace. That bucket''s paths start with '
  'a literal segment (tours/… or settlement/…) rather than a workspace id, so '
  'folder-scoping is impossible without moving every file. The tour id is at '
  'segment 2 in both shapes; this joins through tours instead. Added by 264.';

-- 3a. receipts — workspace is the first folder segment.
DROP POLICY IF EXISTS receipts_storage_select ON storage.objects;
DROP POLICY IF EXISTS receipts_storage_insert ON storage.objects;
DROP POLICY IF EXISTS receipts_storage_update ON storage.objects;
DROP POLICY IF EXISTS receipts_storage_delete ON storage.objects;

CREATE POLICY receipts_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts'
         AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);
CREATE POLICY receipts_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts'
         AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);
CREATE POLICY receipts_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts'
         AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);
CREATE POLICY receipts_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts'
         AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);

-- 3b. budget-files — same shape.
DROP POLICY IF EXISTS budget_files_storage_select ON storage.objects;
DROP POLICY IF EXISTS budget_files_storage_insert ON storage.objects;
DROP POLICY IF EXISTS budget_files_storage_update ON storage.objects;
DROP POLICY IF EXISTS budget_files_storage_delete ON storage.objects;

CREATE POLICY budget_files_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'budget-files'
         AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);
CREATE POLICY budget_files_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'budget-files'
         AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);
CREATE POLICY budget_files_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'budget-files'
         AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);
CREATE POLICY budget_files_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'budget-files'
         AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);

-- 3c. budget-receipts — tour id at segment 2, joined through tours.
DROP POLICY IF EXISTS budget_receipts_storage_select ON storage.objects;
DROP POLICY IF EXISTS budget_receipts_storage_insert ON storage.objects;
DROP POLICY IF EXISTS budget_receipts_storage_update ON storage.objects;
DROP POLICY IF EXISTS budget_receipts_storage_delete ON storage.objects;

CREATE POLICY budget_receipts_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'budget-receipts' AND public.storage_tour_in_my_workspace(name));
CREATE POLICY budget_receipts_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'budget-receipts' AND public.storage_tour_in_my_workspace(name));
CREATE POLICY budget_receipts_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'budget-receipts' AND public.storage_tour_in_my_workspace(name));
CREATE POLICY budget_receipts_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'budget-receipts' AND public.storage_tour_in_my_workspace(name));


-- ── down (manual) ──────────────────────────────────────────────────────────
-- Reverting REOPENS both holes. Only for an emergency rollback.
--   DROP POLICY IF EXISTS budget_settings_insert_gated ON public.budget_settings;
--   DROP POLICY IF EXISTS budget_settings_update_gated ON public.budget_settings;
--   DROP POLICY IF EXISTS budget_settings_delete_gated ON public.budget_settings;
--   CREATE POLICY budget_settings_workspace ON public.budget_settings
--     FOR ALL USING (workspace_id = public.get_my_workspace_id());
--   -- and re-create <table>_workspace FOR ALL on the seven step-1 tables.
--   -- Storage: replace each policy body with (auth.uid() IS NOT NULL).
