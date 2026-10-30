-- ============================================
-- 279_export_templates_advance.sql
--
-- Advance PDFs join the export system (Oct 2026): 'advance' (one show's
-- filled advance) and 'advance-questions' (the question sheet sent to a
-- venue) can have saved export templates like every other export. The
-- export_templates surface CHECK must allow them — it must match
-- EXPORT_SURFACES in src/lib/export/template-config.ts (pinned by
-- src/lib/export/exportSurfaces.test.tsx).
--
-- Re-runnable: the CHECK is dropped (whatever its name) and re-created.
-- Changes no rows.
-- ============================================

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.export_templates'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%surface%'
  LOOP
    EXECUTE format('ALTER TABLE public.export_templates DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.export_templates
  ADD CONSTRAINT export_templates_surface_check
  CHECK (surface IN ('budget', 'rooming', 'payroll', 'routing', 'channel-list', 'stage-plot', 'settlement', 'gear-manifest', 'carnet', 'advance', 'advance-questions'));

-- Check (expect the new list):
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.export_templates'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%surface%';

-- ============================================
-- DOWN (manual; fails while advance templates exist — delete those first):
-- ALTER TABLE public.export_templates DROP CONSTRAINT IF EXISTS export_templates_surface_check;
-- ALTER TABLE public.export_templates ADD CONSTRAINT export_templates_surface_check
--   CHECK (surface IN ('budget', 'rooming', 'payroll', 'routing', 'channel-list', 'stage-plot', 'settlement', 'gear-manifest', 'carnet'));
-- ============================================
