-- ============================================================================
-- 291 — Beta blockers (Nov 2026, Adam — permissions audit step 1)
-- ============================================================================
--
-- Closes the cross-workspace and cost findings from
-- docs/handover/PERMISSIONS_AUDIT_2026_11.md before beta testers (each the
-- admin of their own workspace) get in. All confirmed live by the probe.
--
--   1. A0  Crew-clash checks returned OTHER workspaces' tours, roles and dates
--          for anyone whose email you typed in. Now: only workspaces the
--          caller is a member of. Busy-elsewhere is private (Adam).
--   2. A2  Profile "Users can update own profile" (001) let anyone set
--          profiles.workspace_id to any workspace. Data was never readable
--          that way, but AI / Google usage could be charged to it. Now a
--          trigger refuses a workspace the user is not a member of. Switching,
--          invite-accept and the admin tools all write a membership first (or
--          NULL), so they keep working.
--      2b: removing a member also moves their profile to another workspace
--          they belong to (else NULL), and a one-off repair does the same for
--          profiles already stranded — so the profile's workspace is always a
--          membership and the app's existing reads of it are sound.
--   3. A3  A workspace's own admin could raise its AI budget without limit
--          (on Adam's key). Now: above the default $25 / month needs a site
--          admin. Lowering is still allowed.
--   4. A7  list_site_admins() returned every site admin to anyone signed in.
--          Now: site admins only.
--   5. A5  advance-files bucket was public with open write rules. It is empty
--          and unused by the app. Now private, rules removed.
--
-- IDEMPOTENT: CREATE OR REPLACE / DROP … IF EXISTS / guarded UPDATE.
-- ONE TRANSACTION (BEGIN … COMMIT): all of it applies, or none of it.
-- The last statement is READ-ONLY and reports each fix as OK / CHECK.
-- ============================================================================


BEGIN;

-- ── 1. Crew clash: own workspaces only ──────────────────────────────────────
-- Same arguments and columns as 084 (what the app reads, incl. conflict_role);
-- the one change is the final workspace filter on the CONFLICTING tour.
-- DROP first: live still had the 083 shape (no conflict_role — 084 was never
-- applied there), and CREATE OR REPLACE cannot change a function's columns
-- (42P13). The whole migration is one transaction, so a failure part-way
-- leaves the functions as they were.
DROP FUNCTION IF EXISTS public.check_personnel_conflicts_batch(UUID[], DATE, DATE, UUID);
DROP FUNCTION IF EXISTS public.check_personnel_conflicts_by_email_batch(TEXT[], DATE, DATE, UUID);

CREATE OR REPLACE FUNCTION public.check_personnel_conflicts_batch(
  p_canonical_person_ids UUID[],
  p_start_date DATE,
  p_end_date DATE,
  p_excluding_tour_id UUID
)
RETURNS TABLE (
  canonical_person_id UUID,
  conflict_workspace_id UUID,
  conflict_workspace_name TEXT,
  conflict_tour_id UUID,
  conflict_tour_name TEXT,
  conflict_role TEXT,
  conflict_start_date DATE,
  conflict_end_date DATE,
  conflict_status TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH mine AS (
    SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
  ),
  allowed_canonical AS (
    SELECT DISTINCT p.canonical_person_id AS id
    FROM public.persons p
    WHERE p.canonical_person_id = ANY(p_canonical_person_ids)
      AND p.workspace_id IN (SELECT workspace_id FROM mine)
  )
  SELECT
    p.canonical_person_id,
    w.id   AS conflict_workspace_id,
    w.name AS conflict_workspace_name,
    t.id   AS conflict_tour_id,
    t.name AS conflict_tour_name,
    tp.role AS conflict_role,
    tp.starts_on AS conflict_start_date,
    tp.ends_on   AS conflict_end_date,
    tp.status    AS conflict_status
  FROM public.tour_personnel tp
  JOIN public.persons p   ON p.id = tp.person_id
  JOIN public.tours t     ON t.id = tp.tour_id
  JOIN public.workspaces w ON w.id = t.workspace_id
  WHERE p.canonical_person_id IN (SELECT id FROM allowed_canonical)
    AND t.workspace_id IN (SELECT workspace_id FROM mine)
    AND tp.tour_id <> p_excluding_tour_id
    AND tp.status IN ('confirmed', 'tentative', 'awaiting_contract')
    AND COALESCE(tp.starts_on, '0001-01-01'::date) <= p_end_date
    AND COALESCE(tp.ends_on,   '9999-12-31'::date) >= p_start_date;
END;
$$;
REVOKE ALL ON FUNCTION public.check_personnel_conflicts_batch(UUID[], DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_personnel_conflicts_batch(UUID[], DATE, DATE, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_personnel_conflicts_by_email_batch(
  p_emails TEXT[],
  p_start_date DATE,
  p_end_date DATE,
  p_excluding_tour_id UUID
)
RETURNS TABLE (
  matched_email TEXT,
  conflict_workspace_id UUID,
  conflict_workspace_name TEXT,
  conflict_tour_id UUID,
  conflict_tour_name TEXT,
  conflict_role TEXT,
  conflict_start_date DATE,
  conflict_end_date DATE,
  conflict_status TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_normalised_emails TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT lower(e))
  INTO v_normalised_emails
  FROM unnest(p_emails) AS e
  WHERE e IS NOT NULL AND length(trim(e)) > 0;

  IF v_normalised_emails IS NULL OR array_length(v_normalised_emails, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH mine AS (
    SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
  ),
  allowed_emails AS (
    SELECT DISTINCT lower(p.email) AS email
    FROM public.persons p
    WHERE lower(p.email) = ANY(v_normalised_emails)
      AND p.workspace_id IN (SELECT workspace_id FROM mine)
  )
  SELECT
    lower(p.email) AS matched_email,
    w.id   AS conflict_workspace_id,
    w.name AS conflict_workspace_name,
    t.id   AS conflict_tour_id,
    t.name AS conflict_tour_name,
    tp.role AS conflict_role,
    tp.starts_on AS conflict_start_date,
    tp.ends_on   AS conflict_end_date,
    tp.status    AS conflict_status
  FROM public.tour_personnel tp
  JOIN public.persons p   ON p.id = tp.person_id
  JOIN public.tours t     ON t.id = tp.tour_id
  JOIN public.workspaces w ON w.id = t.workspace_id
  WHERE lower(p.email) IN (SELECT email FROM allowed_emails)
    AND t.workspace_id IN (SELECT workspace_id FROM mine)
    AND tp.tour_id <> p_excluding_tour_id
    AND tp.status IN ('confirmed', 'tentative', 'awaiting_contract')
    AND COALESCE(tp.starts_on, '0001-01-01'::date) <= p_end_date
    AND COALESCE(tp.ends_on,   '9999-12-31'::date) >= p_start_date;
END;
$$;
REVOKE ALL ON FUNCTION public.check_personnel_conflicts_by_email_batch(TEXT[], DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_personnel_conflicts_by_email_batch(TEXT[], DATE, DATE, UUID) TO authenticated;


-- ── 2. A profile can only point at a workspace its user belongs to ──────────
-- BEFORE UPDATE, only when workspace_id actually changes to a non-null value.
-- No role bypass: every legitimate writer (switch, invite accept, admin tools)
-- writes the membership first or sets NULL. Raises 42501 (insufficient
-- privilege) so the client sees a refusal, not a silent no-op.

CREATE OR REPLACE FUNCTION public.profiles_workspace_must_be_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS NOT NULL
     AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     AND NOT EXISTS (
       SELECT 1 FROM public.workspace_members m
       WHERE m.user_id = NEW.id AND m.workspace_id = NEW.workspace_id
     ) THEN
    RAISE EXCEPTION 'Not a member of that workspace' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_workspace_must_be_member() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_workspace_must_be_member ON public.profiles;
CREATE TRIGGER profiles_workspace_must_be_member
  BEFORE UPDATE OF workspace_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_workspace_must_be_member();


-- ── 2b. Removing a member moves their profile off that workspace ───────────
-- Without this, someone removed from a workspace (members screen or admin
-- tools) kept it as their profile's workspace — and code that reads the
-- profile's workspace (AI / Google usage metering) went on charging it. Now
-- their profile moves to another workspace they belong to, else NULL. With 2,
-- profiles.workspace_id is always a workspace the user belongs to.

CREATE OR REPLACE FUNCTION public.workspace_members_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles p
     SET workspace_id = (
       SELECT m.workspace_id FROM public.workspace_members m
       WHERE m.user_id = OLD.user_id
       ORDER BY m.is_workspace_owner DESC, m.created_at
       LIMIT 1
     )
   WHERE p.id = OLD.user_id AND p.workspace_id = OLD.workspace_id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.workspace_members_after_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS workspace_members_after_delete ON public.workspace_members;
CREATE TRIGGER workspace_members_after_delete
  AFTER DELETE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.workspace_members_after_delete();

-- One-off repair: profiles already pointing at a workspace they're not in.
UPDATE public.profiles p
   SET workspace_id = (
     SELECT m.workspace_id FROM public.workspace_members m
     WHERE m.user_id = p.id
     ORDER BY m.is_workspace_owner DESC, m.created_at
     LIMIT 1
   )
 WHERE p.workspace_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.workspace_members m
                   WHERE m.user_id = p.id AND m.workspace_id = p.workspace_id);


-- ── 3. AI budget: above the default needs a site admin ──────────────────────
-- Applies only to signed-in callers (current_user = 'authenticated'); the
-- service role and the SQL editor are unaffected. A workspace admin can still
-- LOWER their budget. The per-user caps can't exceed the workspace budget in
-- effect (withAiUsage blocks on whichever is hit first), so the workspace
-- figure is the one ceiling that matters.

-- SECURITY INVOKER on purpose: inside a SECURITY DEFINER function
-- current_user is the OWNER, so the 'authenticated' test would never match
-- and the ceiling would silently never apply.
CREATE OR REPLACE FUNCTION public.ai_usage_limits_ceiling()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND NOT public.is_site_admin()
     AND NEW.monthly_budget_usd_micros > 25000000 THEN
    RAISE EXCEPTION 'AI budget above $25 a month needs a Lowpass site admin' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_usage_limits_ceiling() FROM PUBLIC;

DROP TRIGGER IF EXISTS ai_usage_limits_ceiling ON public.ai_usage_limits;
CREATE TRIGGER ai_usage_limits_ceiling
  BEFORE INSERT OR UPDATE ON public.ai_usage_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.ai_usage_limits_ceiling();


-- ── 4. list_site_admins: site admins only ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_site_admins()
RETURNS TABLE (
  id         UUID,
  email      TEXT,
  name       TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email, p.name, p.avatar_url, p.created_at
    FROM public.profiles p
   WHERE p.is_site_admin = true
     AND public.is_site_admin()
   ORDER BY lower(p.name), lower(p.email);
$$;
REVOKE ALL ON FUNCTION public.list_site_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_site_admins() TO authenticated, service_role;


-- ── 5. advance-files: private, open rules removed (empty, unused) ───────────
UPDATE storage.buckets SET public = false WHERE id = 'advance-files' AND public;
DROP POLICY IF EXISTS "advance_files_select" ON storage.objects;
DROP POLICY IF EXISTS "advance_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "advance_files_delete" ON storage.objects;
DROP POLICY IF EXISTS "advance_files_update" ON storage.objects;

COMMIT;


-- ── READ-ONLY check ─────────────────────────────────────────────────────────
SELECT '1 crew clash scoped to own workspaces' AS fix,
       CASE WHEN pg_get_functiondef('public.check_personnel_conflicts_by_email_batch(text[],date,date,uuid)'::regprocedure)
                 ILIKE '%t.workspace_id IN (SELECT workspace_id FROM mine)%'
             AND pg_get_functiondef('public.check_personnel_conflicts_batch(uuid[],date,date,uuid)'::regprocedure)
                 ILIKE '%t.workspace_id IN (SELECT workspace_id FROM mine)%'
            THEN 'OK' ELSE 'CHECK' END AS status
UNION ALL
SELECT '2 profile workspace must be a membership',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_workspace_must_be_member') THEN 'OK' ELSE 'CHECK' END
UNION ALL
SELECT '2b profiles all point at a workspace they belong to',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'workspace_members_after_delete')
             AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.workspace_id IS NOT NULL
                             AND NOT EXISTS (SELECT 1 FROM public.workspace_members m
                                             WHERE m.user_id = p.id AND m.workspace_id = p.workspace_id))
            THEN 'OK' ELSE 'CHECK' END
UNION ALL
SELECT '3 AI budget ceiling',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ai_usage_limits_ceiling') THEN 'OK' ELSE 'CHECK' END
UNION ALL
SELECT '4 list_site_admins guarded',
       CASE WHEN pg_get_functiondef('public.list_site_admins()'::regprocedure) ILIKE '%AND public.is_site_admin()%' THEN 'OK' ELSE 'CHECK' END
UNION ALL
SELECT '5 advance-files private, no open rules',
       CASE WHEN NOT coalesce((SELECT public FROM storage.buckets WHERE id = 'advance-files'), false)
             AND NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                             WHERE c.relname = 'objects'
                               AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ILIKE '%advance-files%')
            THEN 'OK' ELSE 'CHECK — another advance-files rule exists; list: SELECT polname FROM pg_policy WHERE pg_get_expr(polqual, polrelid) ILIKE ''%advance-files%''' END;


-- ── down ────────────────────────────────────────────────────────────────────
-- Functions 1 and 4: re-paste their bodies from 084 / 037.
-- DROP TRIGGER IF EXISTS profiles_workspace_must_be_member ON public.profiles;
-- DROP FUNCTION IF EXISTS public.profiles_workspace_must_be_member();
-- DROP TRIGGER IF EXISTS workspace_members_after_delete ON public.workspace_members;
-- DROP FUNCTION IF EXISTS public.workspace_members_after_delete();
-- DROP TRIGGER IF EXISTS ai_usage_limits_ceiling ON public.ai_usage_limits;
-- DROP FUNCTION IF EXISTS public.ai_usage_limits_ceiling();
-- (advance-files stays private — it was empty and unused.)
