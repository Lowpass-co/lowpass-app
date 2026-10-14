-- ============================================
-- LOWPASS — export templates can be saved for every export
-- Migration 272
-- ============================================
--
-- Paste into the Supabase SQL Editor and Run. Safe to paste twice: the old
-- constraint is dropped if present and the new one is re-created.
--
-- THE BUG. Migration 224 created export_templates with
--   surface CHECK (surface IN ('budget', 'rooming', 'payroll', 'routing'))
-- and the templates API kept its own copy of the same four. Every export
-- added since — channel list, stage plot, settlement, day sheet, gear
-- manifest, ATA carnet — got a template panel in the export dialog whose
-- Save could never succeed ("Could not save the template"), and whose saved
-- list could never load.
--
-- THE FIX. Allow every surface. The list below is EXPORT_SURFACES in
-- src/lib/export/template-config.ts; a test (exportSurfaces.test.tsx) fails if
-- the two ever differ, so the next new export can't repeat this.
-- ============================================

DO $$
DECLARE c record;
BEGIN
  -- Drop whichever CHECK constrains surface (224's was unnamed → Postgres
  -- named it export_templates_surface_check; don't rely on that).
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
  CHECK (surface IN ('budget', 'rooming', 'payroll', 'routing', 'channel-list', 'stage-plot', 'settlement', 'daysheet', 'gear-manifest', 'carnet'));

-- ============================================
-- DOWN (manual; fails if any row uses a newer surface — delete those first):
-- ALTER TABLE public.export_templates DROP CONSTRAINT IF EXISTS export_templates_surface_check;
-- ALTER TABLE public.export_templates ADD CONSTRAINT export_templates_surface_check
--   CHECK (surface IN ('budget', 'rooming', 'payroll', 'routing'));
-- ============================================
