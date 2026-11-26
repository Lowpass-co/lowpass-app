-- ============================================================================
-- 299_flight_lookups.sql  (Nov 2026, Adam: "lets do aviationstack … just have
-- the search function. just make sure we don't burn those 100 requests")
--
-- Every flight search the app makes to the outside data provider is a row
-- here — a CACHE (the same flight + date is answered from here, not the
-- provider) and the METER (the month's provider calls are counted from here,
-- so the cap holds across every server instance).
--
--   flight_lookup_reserve(cap, workspace cap, …) takes ONE call from the
--   month's allowance atomically (advisory lock) and returns the row id, or
--   NULL when the month (or the workspace's share) is used up — then nothing
--   is sent to the provider at all.
--
-- No client can read or write this table: RLS on, no policies; the server
-- uses the service role after checking who's asking. Re-runnable.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.flight_lookups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT NOT NULL,
  flight_iata   TEXT NOT NULL,
  flight_date   DATE NOT NULL,
  -- pending → ok | not_found | error   (a pending row is a call in flight)
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'not_found', 'error')),
  result        JSONB,
  error         TEXT,
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  requested_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flight_lookups_flight_idx ON public.flight_lookups (flight_iata, flight_date, created_at DESC);
CREATE INDEX IF NOT EXISTS flight_lookups_month_idx ON public.flight_lookups (created_at);
ALTER TABLE public.flight_lookups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flight_lookups FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.flight_lookup_reserve(
  p_cap INT, p_workspace_cap INT, p_provider TEXT, p_flight_iata TEXT, p_flight_date DATE,
  p_workspace_id UUID, p_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_used INT; v_ws_used INT; v_id UUID;
BEGIN
  -- One reservation at a time, so two clicks can't both take the last call.
  PERFORM pg_advisory_xact_lock(hashtext('flight_lookup_reserve'));
  SELECT count(*) INTO v_used FROM public.flight_lookups
   WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF v_used >= p_cap THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_ws_used FROM public.flight_lookups
   WHERE workspace_id = p_workspace_id
     AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF v_ws_used >= p_workspace_cap THEN RETURN NULL; END IF;
  INSERT INTO public.flight_lookups (provider, flight_iata, flight_date, workspace_id, requested_by)
  VALUES (p_provider, p_flight_iata, p_flight_date, p_workspace_id, p_user_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;
REVOKE ALL ON FUNCTION public.flight_lookup_reserve(INT, INT, TEXT, TEXT, DATE, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flight_lookup_reserve(INT, INT, TEXT, TEXT, DATE, UUID, UUID) TO service_role;

COMMIT;

-- DOWN:
-- DROP FUNCTION IF EXISTS public.flight_lookup_reserve(INT, INT, TEXT, TEXT, DATE, UUID, UUID);
-- DROP TABLE IF EXISTS public.flight_lookups;
