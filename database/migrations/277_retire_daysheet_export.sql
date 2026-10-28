-- ============================================
-- 277_retire_daysheet_export.sql
--
-- Day sheets were retired in the Advance rebuild (Oct 2026, Adam): the day
-- sheet page, the crew phone links (/m/day) and the Day Sheet PDF export are
-- gone. This removes the 'daysheet' export surface:
--
--   1. deletes saved Day Sheet export templates (nothing can use them now —
--      the export that read them no longer exists);
--   2. re-creates the export_templates surface CHECK without 'daysheet'
--      (it must match EXPORT_SURFACES in src/lib/export/template-config.ts —
--      pinned by src/lib/export/exportSurfaces.test.tsx).
--
-- NOT touched: tour_roles and tour_role_links (the crew-link tables). No code
-- reads them any more; they are left in place so nothing is lost.
--
-- Re-runnable: the DELETE matches nothing the second time, and the CHECK is
-- dropped (whatever its name) and re-created.
-- ============================================

DELETE FROM public.export_templates WHERE surface = 'daysheet';

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
  CHECK (surface IN ('budget', 'rooming', 'payroll', 'routing', 'channel-list', 'stage-plot', 'settlement', 'gear-manifest', 'carnet'));

-- Check (expect 0):
-- SELECT count(*) FROM public.export_templates WHERE surface = 'daysheet';

-- ============================================
-- DOWN (manual; deleted Day Sheet templates are not restored):
-- ALTER TABLE public.export_templates DROP CONSTRAINT IF EXISTS export_templates_surface_check;
-- ALTER TABLE public.export_templates ADD CONSTRAINT export_templates_surface_check
--   CHECK (surface IN ('budget', 'rooming', 'payroll', 'routing', 'channel-list', 'stage-plot', 'settlement', 'daysheet', 'gear-manifest', 'carnet'));
-- ============================================
