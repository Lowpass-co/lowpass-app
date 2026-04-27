-- Triage: mark bundled bug report rows as pending testing (2026-04-26 export).
UPDATE public.bug_reports
SET
  status = 'pending_testing',
  updated_at = now()
WHERE id IN (
  '1c9a5487-0d9b-4897-a0fa-cdc59511124a',
  '62309d8e-c0d3-4f74-a55d-0c2524121fd8',
  '16217036-da98-4105-9340-b9d39d8d2625',
  'f225ea52-c2af-4082-a02f-001ee8b7b08e',
  '915d21b9-0a72-443a-9d2e-1bf49cd265ff',
  '122f9558-7e03-4c30-a3a1-a2a4ebdf42f2',
  'ebfb6ea1-0e9e-4480-8b2f-d256a8d8df04',
  '00a5c55a-0b87-43db-bbf3-3be1ce149a5f',
  'fdea397f-8de5-484b-8a6b-afaa6c8c7176',
  'f918b9e7-dd96-460b-ad5f-7cfbb79dd947'
);
