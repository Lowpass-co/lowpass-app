-- ============================================
-- LOWPASS — Storage bucket orphan capture
-- Migration 065
--
-- Three storage buckets are referenced from code but never had a tracked
-- INSERT INTO storage.buckets in any migration. They were created in the
-- Supabase Dashboard. A fresh-clone bootstrap produces a database where
-- every upload route 500s with "Storage bucket not found".
--
--   - receipts        — used by src/app/api/expenses/route.ts and /[id]/route.ts
--   - budget-files    — used by /api/budget/line-items/[id]/details + attachments
--   - artist-assets   — used by /api/upload/artist-asset/route.ts
--                       (policies in 007, but bucket creation was via Dashboard)
--
-- All three are scoped to authenticated users via storage.objects RLS.
-- 'artist-assets' is public-read so logo/banner URLs work in app and emails;
-- 'receipts' and 'budget-files' are private.
--
-- Idempotent: ON CONFLICT DO NOTHING on the bucket inserts; DROP IF EXISTS
-- on the policies. Safe to re-run against production where the buckets
-- already exist (no-op).
--
-- Originally surfaced by docs/handover/SQL_DRIFT_AUDIT_2026_04_30.md §4
-- and re-confirmed by docs/handover/AUDIT_2026-05-01.md §2.5.
--
-- Numbering: 064 is taken by feat/product-split-phase3 (budget_line_items
-- phase_tag). 065 is the next free number after main + active branches.
-- ============================================

-- ════════════════════════════════════════════
-- 1. receipts (private — expense receipts)
-- ════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "receipts_storage_select" ON storage.objects;
CREATE POLICY "receipts_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "receipts_storage_insert" ON storage.objects;
CREATE POLICY "receipts_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'receipts' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "receipts_storage_update" ON storage.objects;
CREATE POLICY "receipts_storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'receipts' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'receipts' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "receipts_storage_delete" ON storage.objects;
CREATE POLICY "receipts_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'receipts' AND auth.uid() IS NOT NULL);

-- ════════════════════════════════════════════
-- 2. budget-files (private — line-item attachments)
-- ════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('budget-files', 'budget-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "budget_files_storage_select" ON storage.objects;
CREATE POLICY "budget_files_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'budget-files' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "budget_files_storage_insert" ON storage.objects;
CREATE POLICY "budget_files_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'budget-files' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "budget_files_storage_update" ON storage.objects;
CREATE POLICY "budget_files_storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'budget-files' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'budget-files' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "budget_files_storage_delete" ON storage.objects;
CREATE POLICY "budget_files_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'budget-files' AND auth.uid() IS NOT NULL);

-- ════════════════════════════════════════════
-- 3. artist-assets (public-read — logo/banner URLs)
-- ════════════════════════════════════════════
--
-- Policies for INSERT and public SELECT exist in 007. This block ONLY
-- adds the missing bucket creation so a fresh clone reproduces production.
-- The 007 policies are not re-emitted (they're idempotent on a re-run
-- via the Supabase pg_policies catalogue, but adding a DROP POLICY
-- IF EXISTS pair here would be redundant).

INSERT INTO storage.buckets (id, name, public)
VALUES ('artist-assets', 'artist-assets', true)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════
-- Down (commented; uncomment to roll back manually):
-- ════════════════════════════════════════════
-- DROP POLICY IF EXISTS "receipts_storage_select" ON storage.objects;
-- DROP POLICY IF EXISTS "receipts_storage_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "receipts_storage_update" ON storage.objects;
-- DROP POLICY IF EXISTS "receipts_storage_delete" ON storage.objects;
-- DROP POLICY IF EXISTS "budget_files_storage_select" ON storage.objects;
-- DROP POLICY IF EXISTS "budget_files_storage_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "budget_files_storage_update" ON storage.objects;
-- DROP POLICY IF EXISTS "budget_files_storage_delete" ON storage.objects;
-- (Don't drop the buckets on rollback — files persist.)
