-- ============================================
-- LOWPASS — Conflict RPCs add conflict_role column (Sprint 9 §7.3)
-- Migration 084
--
-- Re-creates the two SECURITY DEFINER batch RPCs from 083 with
-- a new conflict_role TEXT column on the RETURNS TABLE. The
-- ConflictBanner UI needs the role string to render
-- "<name> is also assigned to <tour> as <role> in <workspace>".
--
-- Idempotent: CREATE OR REPLACE replaces the prior bodies in
-- place. All other columns + permission gating are preserved
-- byte-for-byte from 083.
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
    tp.role AS conflict_role,
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
    AND COALESCE(tp.starts_on, '0001-01-01'::date) <= p_end_date
    AND COALESCE(tp.ends_on,   '9999-12-31'::date) >= p_start_date;
END;
$$;

REVOKE ALL ON FUNCTION public.check_personnel_conflicts_batch(UUID[], DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_personnel_conflicts_batch(UUID[], DATE, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION public.check_personnel_conflicts_batch(UUID[], DATE, DATE, UUID) IS
  'Sprint 9 §7.3 — adds conflict_role column to the conflict-detection RPC payload so the ConflictBanner UI can render the role inline. Otherwise identical to 083.';

-- Email-fallback batch RPC: same conflict_role addition.
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
    tp.role AS conflict_role,
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
  'Sprint 9 §7.3 — adds conflict_role to the email-fallback RPC payload. Otherwise identical to 083.';
