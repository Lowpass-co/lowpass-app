-- ============================================
-- LOWPASS — Realtime publication (Sprint 9 §4)
-- Migration 081
--
-- Adds tables to the supabase_realtime publication so
-- postgres_changes events fire for them. Sprint 9 §4 enables
-- routing only — the demonstrative use case for the
-- useRealtimeRows hook in RoutingEditor. Phase 5/6 add
-- advance_instances, tour_personnel, personnel_tour_assignments
-- as their pages start consuming the hook.
--
-- Idempotent: ALTER PUBLICATION ADD TABLE errors on duplicate,
-- so we wrap in a DO block that checks pg_publication_tables.
-- ============================================

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['routing'];
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
      RAISE NOTICE '[081] Added public.% to supabase_realtime publication', tbl;
    ELSE
      RAISE NOTICE '[081] public.% already in supabase_realtime publication — skipping', tbl;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- DOWN (manual rollback)
-- ============================================
-- DO $$
-- BEGIN
--   IF EXISTS (
--     SELECT 1 FROM pg_publication_tables
--     WHERE pubname = 'supabase_realtime'
--       AND schemaname = 'public'
--       AND tablename = 'routing'
--   ) THEN
--     ALTER PUBLICATION supabase_realtime DROP TABLE public.routing;
--   END IF;
-- END $$;
