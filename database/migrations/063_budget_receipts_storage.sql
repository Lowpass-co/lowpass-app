-- ============================================
-- LOWPASS — budget-receipts storage bucket + RLS
-- Migration 063
--
-- The /api/budget/receipts/upload route (referenced from migration
-- 017's expense_receipts table) uploads files to a Supabase Storage
-- bucket named "budget-receipts". The bucket has never been created
-- via a tracked migration — operators have either provisioned it
-- manually via the Supabase Dashboard or hit the upload route's
-- "Storage bucket not found" error path.
--
-- Even when the bucket exists, storage.objects has RLS enabled by
-- default and there's no policy granting INSERT for budget-receipts.
-- That surfaces as "new row violates row-level security policy" when
-- the user drags a file into the Receipt Inbox.
--
-- This migration creates the bucket idempotently and adds the four
-- canonical CRUD policies for storage.objects scoped to bucket_id =
-- 'budget-receipts' + auth.uid() IS NOT NULL. Mirrors the pattern
-- from 016_advance_files_storage.sql / 027_personnel_files_storage.sql.
--
-- Numbering: 060/061/062 are reserved for the migration-repo-sync,
-- RLS-audit, and initial-site-admins migrations queued in PRs #4/#5.
-- 063 is the next safe number on this branch.
-- ============================================

-- 1. Bucket (private — receipt files are sensitive).
INSERT INTO storage.buckets (id, name, public)
VALUES ('budget-receipts', 'budget-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies. Drop-then-create so re-running is safe.
DROP POLICY IF EXISTS "budget_receipts_storage_select" ON storage.objects;
CREATE POLICY "budget_receipts_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'budget-receipts' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "budget_receipts_storage_insert" ON storage.objects;
CREATE POLICY "budget_receipts_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'budget-receipts' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "budget_receipts_storage_update" ON storage.objects;
CREATE POLICY "budget_receipts_storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'budget-receipts' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'budget-receipts' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "budget_receipts_storage_delete" ON storage.objects;
CREATE POLICY "budget_receipts_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'budget-receipts' AND auth.uid() IS NOT NULL);

-- Down (commented; uncomment to roll back manually):
-- DROP POLICY IF EXISTS "budget_receipts_storage_select" ON storage.objects;
-- DROP POLICY IF EXISTS "budget_receipts_storage_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "budget_receipts_storage_update" ON storage.objects;
-- DROP POLICY IF EXISTS "budget_receipts_storage_delete" ON storage.objects;
-- (Don't drop the bucket on rollback — files persist.)
