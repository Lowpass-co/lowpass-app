-- ============================================
-- LOWPASS — Personnel conflict RPCs + Realtime publication (Sprint 9 §6)
-- Migration 083
--
-- Adds two SECURITY DEFINER RPCs for cross-workspace personnel
-- conflict detection used by the Operations Personnel page,
-- plus extends the supabase_realtime publication to cover
-- tour_personnel + personnel.
--
-- Both RPCs return ARRAYS rather than per-person calls so a
-- manager view loading 20 assigned people fires ONE query, not
-- 20. Each row carries the canonical_person_id (or email for
-- the fallback variant) so the API can group results client-
-- side.
--
-- Permission gate inside the RPCs:
--   Caller must have at least one personnel record in any
--   workspace they're a member of, linked to the same
--   canonical_person_id (or matching email for the fallback).
--   This prevents cross-workspace data fishing — you only see
--   conflicts for people you've already worked with.
-- ============================================

-- ============================================
-- 1. check_personnel_conflicts_batch
--    Canonical-id-based path (post-link).
-- ============================================
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

  -- Restrict to canonical_person_ids the caller has any
  -- relationship with (a persons row in any workspace they're
  -- a member of, linked to that canonical_person_id). Empty
  -- otherwise — fail closed.
  RETURN QUERY
  WITH allowed_canonical AS (
    SELECT DISTINCT p.canonical_person_id AS id
    FROM public.persons p
    WHERE p.canonical_person_id = ANY(p_canonical_person_ids)
      AND p.workspace_id IN (
        SELECT m.workspace_id FROM public.workspace_members m
        WHERE m.user_id = auth.uid()
      )
  )
  SELECT
    p.canonical_person_id,
    w.id   AS conflict_workspace_id,
    w.name AS conflict_workspace_name,
    t.id   AS conflict_tour_id,
    t.name AS conflict_tour_name,
    tp.starts_on AS conflict_start_date,
    tp.ends_on   AS conflict_end_date,
    tp.status    AS conflict_status
  FROM public.tour_personnel tp
  JOIN public.persons p   ON p.id = tp.person_id
  JOIN public.tours t     ON t.id = tp.tour_id
  JOIN public.workspaces w ON w.id = t.workspace_id
  WHERE p.canonical_person_id IN (SELECT id FROM allowed_canonical)
    AND tp.tour_id <> p_excluding_tour_id
    AND tp.status IN ('confirmed', 'tentative', 'awaiting_contract')
    -- Window overlap: not (a.end < b.start OR a.start > b.end).
    AND COALESCE(tp.starts_on, '0001-01-01'::date) <= p_end_date
    AND COALESCE(tp.ends_on,   '9999-12-31'::date) >= p_start_date;
END;
$$;

REVOKE ALL ON FUNCTION public.check_personnel_conflicts_batch(UUID[], DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_personnel_conflicts_batch(UUID[], DATE, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION public.check_personnel_conflicts_batch(UUID[], DATE, DATE, UUID) IS
  'Sprint 9 §6 — batch cross-workspace conflict lookup keyed on canonical_person_id. Caller must have a persons row linked to each id in a workspace they are a member of; otherwise that id''s conflicts are silently omitted.';

-- ============================================
-- 2. check_personnel_conflicts_by_email_batch
--    Email-fallback path for persons without canonical_person_id
--    (pre-backfill rows).
-- ============================================
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

  -- Lowercase + dedupe input emails so the IN-list matches
  -- regardless of caller casing.
  SELECT array_agg(DISTINCT lower(e))
  INTO v_normalised_emails
  FROM unnest(p_emails) AS e
  WHERE e IS NOT NULL AND length(trim(e)) > 0;

  IF v_normalised_emails IS NULL OR array_length(v_normalised_emails, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Same admission gate as the canonical variant: caller must
  -- have a persons row matching the email in a workspace they
  -- belong to.
  RETURN QUERY
  WITH allowed_emails AS (
    SELECT DISTINCT lower(p.email) AS email
    FROM public.persons p
    WHERE lower(p.email) = ANY(v_normalised_emails)
      AND p.workspace_id IN (
        SELECT m.workspace_id FROM public.workspace_members m
        WHERE m.user_id = auth.uid()
      )
  )
  SELECT
    lower(p.email) AS matched_email,
    w.id   AS conflict_workspace_id,
    w.name AS conflict_workspace_name,
    t.id   AS conflict_tour_id,
    t.name AS conflict_tour_name,
    tp.starts_on AS conflict_start_date,
    tp.ends_on   AS conflict_end_date,
    tp.status    AS conflict_status
  FROM public.tour_personnel tp
  JOIN public.persons p   ON p.id = tp.person_id
  JOIN public.tours t     ON t.id = tp.tour_id
  JOIN public.workspaces w ON w.id = t.workspace_id
  WHERE lower(p.email) IN (SELECT email FROM allowed_emails)
    AND tp.tour_id <> p_excluding_tour_id
    AND tp.status IN ('confirmed', 'tentative', 'awaiting_contract')
    AND COALESCE(tp.starts_on, '0001-01-01'::date) <= p_end_date
    AND COALESCE(tp.ends_on,   '9999-12-31'::date) >= p_start_date;
END;
$$;

REVOKE ALL ON FUNCTION public.check_personnel_conflicts_by_email_batch(TEXT[], DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_personnel_conflicts_by_email_batch(TEXT[], DATE, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION public.check_personnel_conflicts_by_email_batch(TEXT[], DATE, DATE, UUID) IS
  'Sprint 9 §6 — fallback batch conflict lookup for persons without canonical_person_id. Eventually redundant once a backfill migration assigns canonical ids; until then both paths run side-by-side.';

-- ============================================
-- 3. Realtime publication: tour_personnel + personnel
-- ============================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['tour_personnel', 'personnel'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        tbl
      );
      RAISE NOTICE '[083] Added public.% to supabase_realtime publication', tbl;
    ELSE
      RAISE NOTICE '[083] public.% already in supabase_realtime publication — skipping', tbl;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- DOWN (manual rollback)
-- ============================================
-- DROP FUNCTION IF EXISTS public.check_personnel_conflicts_batch(UUID[], DATE, DATE, UUID);
-- DROP FUNCTION IF EXISTS public.check_personnel_conflicts_by_email_batch(TEXT[], DATE, DATE, UUID);
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tour_personnel') THEN
--     ALTER PUBLICATION supabase_realtime DROP TABLE public.tour_personnel;
--   END IF;
--   IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='personnel') THEN
--     ALTER PUBLICATION supabase_realtime DROP TABLE public.personnel;
--   END IF;
-- END $$;
