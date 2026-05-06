-- ============================================
-- LOWPASS — Tour delete cascade audit
-- Migration 068
--
-- Sprint 8.1 §5 — adds the "Delete tour" UX. The new
-- /api/tours/[id] DELETE route relies on every tour-scoped
-- table having ON DELETE CASCADE on its tour_id FK.
--
-- This migration AUDITS that condition. It re-asserts CASCADE
-- on every known tour-scoped table, then does an integrity check
-- that flags any FK whose action is not 'c' (CASCADE).
--
-- All 22 tour-scoped tables already have ON DELETE CASCADE per
-- their original CREATE TABLE migrations (see Sprint 8.1
-- diagnosis). This migration is defensive: it makes the cascade
-- intent explicit at the audit boundary AND fails the migration
-- run if anyone has subsequently weakened a constraint.
--
-- Idempotent: if the constraint is already CASCADE, the
-- ALTER is a no-op semantically; the runner records the
-- migration as applied and a re-run skips it.
--
-- Storage cleanup (rider-asset files in Supabase Storage) is
-- NOT performed by the cascade. Those files orphan after a
-- tour delete. v1 accepts this; a follow-up sprint will add
-- explicit prefix-remove calls in the DELETE route.
-- ============================================

-- 1. Re-assert ON DELETE CASCADE on every tour_id FK.
--
-- Constraint names follow PostgreSQL's auto-naming convention
-- ({table}_{column}_fkey) for the tables created via the
-- Sprint 1+ migrations. ALTER ... DROP CONSTRAINT IF EXISTS
-- followed by ADD CONSTRAINT is the standard re-assertion
-- pattern; the IF EXISTS guard makes it safe to re-run.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'routing',
    'personnel_tour_assignments',
    'advance_form_configs',
    'advance_schedule_templates',
    'budget_settings',
    'budget_commissions',
    'budget_line_items',
    'personnel_rates',
    'payroll_entries',
    'rooming_grid',
    'hotel_bookings',
    'flight_bookings',
    'expense_receipts',
    'rider_packs',
    'rider_assets',
    'rider_folders',
    'flights',
    'tour_personnel',
    'hotels',
    'tour_gear',
    'deal_memos',
    'expenses'
  ];
  fk_name TEXT;
  fk_action CHAR;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    -- Skip tables that don't exist in this database (some are
    -- environment-specific; see CLAUDE.md note about
    -- direct-pasted tables).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Skipping % — table does not exist', t;
      CONTINUE;
    END IF;

    -- Find the tour_id FK on this table (whatever its name).
    SELECT conname INTO fk_name
    FROM pg_constraint c
    JOIN pg_class cls ON cls.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE n.nspname = 'public'
      AND cls.relname = t
      AND c.contype = 'f'
      AND EXISTS (
        SELECT 1
        FROM unnest(c.conkey) ck
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ck
        WHERE a.attname = 'tour_id'
      )
    LIMIT 1;

    IF fk_name IS NULL THEN
      RAISE NOTICE 'Skipping % — no tour_id FK found', t;
      CONTINUE;
    END IF;

    -- Read its delete action. 'c' = CASCADE, 'r' = RESTRICT,
    -- 'a' = NO ACTION, 'n' = SET NULL, 'd' = SET DEFAULT.
    SELECT confdeltype INTO fk_action
    FROM pg_constraint
    WHERE conname = fk_name
      AND conrelid = (t::regclass);

    IF fk_action = 'c' THEN
      RAISE NOTICE '% (%) already CASCADE — leaving as-is', t, fk_name;
    ELSE
      -- Re-assert CASCADE. Drop + re-add inside the same
      -- transaction so a failure rolls the change back.
      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I',
        t, fk_name
      );
      EXECUTE format(
        'ALTER TABLE public.%I '
        'ADD CONSTRAINT %I '
        'FOREIGN KEY (tour_id) REFERENCES public.tours(id) '
        'ON DELETE CASCADE',
        t, fk_name
      );
      RAISE NOTICE 'Re-asserted CASCADE on %.%', t, fk_name;
    END IF;
  END LOOP;
END
$$;

-- 2. Integrity check — fail the migration if anything still
--    isn't CASCADE. Belt-and-braces; the loop above should
--    have fixed any laggards.
DO $$
DECLARE
  bad RECORD;
  bad_count INTEGER := 0;
BEGIN
  FOR bad IN
    SELECT cls.relname AS tbl, c.conname AS fk, c.confdeltype AS act
    FROM pg_constraint c
    JOIN pg_class cls ON cls.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE n.nspname = 'public'
      AND c.contype = 'f'
      AND c.confdeltype <> 'c'
      AND EXISTS (
        SELECT 1
        FROM unnest(c.conkey) ck
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ck
        WHERE a.attname = 'tour_id'
      )
      AND EXISTS (
        SELECT 1 FROM pg_class tcls
        JOIN pg_namespace tn ON tn.oid = tcls.relnamespace
        WHERE tcls.oid = c.confrelid
          AND tn.nspname = 'public'
          AND tcls.relname = 'tours'
      )
  LOOP
    bad_count := bad_count + 1;
    RAISE WARNING 'tour_id FK % on %.% is not CASCADE (action=%)',
      bad.fk, 'public', bad.tbl, bad.act;
  END LOOP;

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'Sprint 8.1 §5 cascade audit failed: % tour_id FK(s) are '
      'not ON DELETE CASCADE. The DELETE /api/tours/[id] route '
      'depends on every tour_id FK cascading. Fix and re-apply.',
      bad_count;
  END IF;
END
$$;

-- 3. COMMENT ON TABLE for future-readers.
COMMENT ON TABLE public.tours IS
  'Tour-level row. Every public.* table with a tour_id FK is '
  'ON DELETE CASCADE so a single DELETE FROM tours WHERE id = ? '
  'wipes the entire tour subgraph (routing, personnel, budget, '
  'rider packs, deal memos, hotels, flights, gear, expenses, '
  'advance configs/templates, payroll, etc.). Storage objects '
  'in Supabase Storage are NOT cleaned up by the cascade — '
  'follow-up sprint to add prefix-remove in the DELETE route.';

-- ============================================
-- Down migration (manual)
-- ============================================
-- This migration only re-asserts existing CASCADE behaviour and
-- adds a COMMENT. There is no destructive change to roll back.
-- If you need to revert the COMMENT:
--   COMMENT ON TABLE public.tours IS NULL;
-- The CASCADE re-assertions are no-ops if the constraints
-- were already CASCADE (the original schema state).
