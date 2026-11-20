-- ============================================
-- 295_admin_delete_users_and_workspaces.sql
--
-- Nov 2026, Adam: "make it so an admin can delete workspaces" and
-- "Delete user also doesn't work".
--
-- 1. USER DELETE failed: columns that record who made a row (flights,
--    people, deal memos, expenses, workbook imports, budget attachments /
--    notes, notification dedup …) reference auth.users / profiles with NO
--    delete rule, so Postgres refused to delete anyone who'd ever made one.
--    Every such NULLABLE reference becomes ON DELETE SET NULL (the row stays,
--    "made by" goes blank). Found from the live catalogue, not from the
--    migration files, so drift in production is covered too.
-- 2. WORKSPACE DELETE: the two pre-200 budget tables whose workspace_id had
--    no rule (budget_line_item_attachments, budget_line_item_notes) cascade
--    like the other ~127 workspace references.
-- 3. public.admin_delete_workspace(id, confirm_name): site admin only; the
--    workspace must be ARCHIVED first and the name typed exactly. Moves any
--    profile that had it active onto another live membership (or NULL), then
--    deletes it — everything under it cascades. Member ACCOUNTS are kept.
-- 4. public.admin_workspace_storage_objects(id): site admin only, and only
--    once the workspace is GONE — lists the stored files that have its id as
--    a folder in their path (every bucket), so the app removes them through
--    the Storage API (Supabase forbids deleting storage rows in SQL).
--
-- Idempotent: constraints already converted are skipped; functions are
-- CREATE OR REPLACE. Ends with a READ-ONLY report of anything still blocking.
-- ============================================

-- 1 + 2. Delete rules ---------------------------------------------------------
DO $$
DECLARE
  r record;
  v_nullable boolean;
  v_rule text;
BEGIN
  FOR r IN
    SELECT c.oid, c.conname, c.conrelid::regclass AS tbl, c.confrelid::regclass AS ref,
           a.attname AS col, ra.attname AS refcol
      FROM pg_constraint c
      JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum = c.conkey[1]
      JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
     WHERE c.contype = 'f'
       AND array_length(c.conkey, 1) = 1
       AND c.confdeltype IN ('a', 'r')                    -- NO ACTION / RESTRICT
       AND c.connamespace = 'public'::regnamespace
       AND (c.confrelid = 'auth.users'::regclass
            OR c.confrelid = 'public.profiles'::regclass
            OR (c.confrelid = 'public.workspaces'::regclass
                AND c.conrelid::regclass::text IN ('budget_line_item_attachments', 'public.budget_line_item_attachments',
                                                   'budget_line_item_notes', 'public.budget_line_item_notes')))
  LOOP
    IF r.ref = 'public.workspaces'::regclass THEN
      v_rule := 'CASCADE';
    ELSE
      SELECT NOT a.attnotnull INTO v_nullable FROM pg_attribute a
       WHERE a.attrelid = r.tbl AND a.attname = r.col;
      IF NOT v_nullable THEN
        RAISE NOTICE 'left alone (NOT NULL, can''t blank it): %.% → %', r.tbl, r.col, r.ref;
        CONTINUE;
      END IF;
      v_rule := 'SET NULL';
    END IF;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I) ON DELETE %s',
                   r.tbl, r.conname, r.col, r.ref, r.refcol, v_rule);
    RAISE NOTICE '%.% → % now ON DELETE %', r.tbl, r.col, r.ref, v_rule;
  END LOOP;
END $$;

-- 3. Delete an archived workspace ---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_workspace(p_workspace_id uuid, p_confirm_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_archived timestamptz;
  v_members int;
  v_tours int;
BEGIN
  -- Same check as 086's admin RPCs (no dependency on either is_site_admin signature).
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_site_admin = TRUE) THEN
    RAISE EXCEPTION 'Forbidden — site admin only' USING ERRCODE = 'P0003';
  END IF;
  SELECT w.name, w.archived_at INTO v_name, v_archived
    FROM public.workspaces w WHERE w.id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_archived IS NULL THEN
    RAISE EXCEPTION 'Archive the workspace before deleting it' USING ERRCODE = '55000';
  END IF;
  IF p_confirm_name IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'The name typed doesn''t match the workspace''s name' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_members FROM public.workspace_members m WHERE m.workspace_id = p_workspace_id;
  SELECT count(*) INTO v_tours FROM public.tours t WHERE t.workspace_id = p_workspace_id;

  -- Anyone still "in" it moves to their oldest other live workspace, else none.
  UPDATE public.profiles p
     SET workspace_id = (
       SELECT m.workspace_id
         FROM public.workspace_members m
         JOIN public.workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = p.id AND m.workspace_id <> p_workspace_id AND w.archived_at IS NULL
        ORDER BY m.created_at
        LIMIT 1)
   WHERE p.workspace_id = p_workspace_id;

  DELETE FROM public.workspaces WHERE id = p_workspace_id;

  RETURN jsonb_build_object('name', v_name, 'members', v_members, 'tours', v_tours);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_workspace(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_workspace(uuid, text) TO authenticated;

-- 4. A deleted workspace's stored files ---------------------------------------
CREATE OR REPLACE FUNCTION public.admin_workspace_storage_objects(p_workspace_id uuid, p_limit int DEFAULT 1000)
RETURNS TABLE (bucket_id text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  -- Same check as 086's admin RPCs (no dependency on either is_site_admin signature).
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_site_admin = TRUE) THEN
    RAISE EXCEPTION 'Forbidden — site admin only' USING ERRCODE = 'P0003';
  END IF;
  -- Never sweep a live workspace's files.
  IF EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace still exists' USING ERRCODE = '55000';
  END IF;
  RETURN QUERY
    SELECT o.bucket_id::text, o.name::text
      FROM storage.objects o
     WHERE o.name LIKE p_workspace_id::text || '/%'
        OR o.name LIKE '%/' || p_workspace_id::text || '/%'
     LIMIT GREATEST(1, LEAST(p_limit, 1000));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_workspace_storage_objects(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_workspace_storage_objects(uuid, int) TO authenticated;

-- Report (read-only): anything that would STILL block a delete. Empty = good.
SELECT c.conrelid::regclass AS "table", a.attname AS "column", c.confrelid::regclass AS "points at",
       CASE c.confdeltype WHEN 'a' THEN 'no rule' WHEN 'r' THEN 'restrict' END AS "on delete",
       a.attnotnull AS "not null"
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
 WHERE c.contype = 'f'
   AND c.confdeltype IN ('a', 'r')
   AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass, 'public.workspaces'::regclass)
 ORDER BY 3, 1;

-- ============================================
-- DOWN (manual): DROP FUNCTION public.admin_workspace_storage_objects(uuid, int);
--                DROP FUNCTION public.admin_delete_workspace(uuid, text);
-- The SET NULL / CASCADE rules are left in place (the old "no rule" only
-- ever made deletes fail).
-- ============================================
