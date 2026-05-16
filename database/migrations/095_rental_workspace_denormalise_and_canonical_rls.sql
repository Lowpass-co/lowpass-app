/* ============================================
   Migration 095 — rental_* workspace_id denormalisation +
   canonical RLS swap (Sprint 12 §1, executes the
   CC_RENTAL_DENORMALISE.md plan in one shot)

   The rental_inventory / rental_jobs / rental_job_items triplet
   was originally schemed user-scoped (user_id ownership) with
   workspace siblings discovered via a JOIN through
   workspace_members. This is the only place in the codebase
   that still hits workspace_members for read filtering — every
   prior RLS audit deferred it. Adam's product call (2026-05-01)
   was to denormalise.

   This migration combines all three steps from the
   CC_RENTAL_DENORMALISE plan (orphan capture done in 092):

     1. ADD COLUMN workspace_id (nullable for backfill)
     2. Backfill from user_id → profiles.workspace_id chain
     3. SET NOT NULL + canonical RLS swap

   Idempotent. Safe to re-run; the backfill UPDATE filters out
   already-set rows.

   Halt criteria: if the post-backfill `WHERE workspace_id IS
   NULL` count is non-zero on any of the three tables, that
   means a user_id in rental_* doesn't resolve to a profile —
   data integrity issue that shouldn't be papered over with a
   default. The SET NOT NULL will fail loudly in that case.

   Apply via: npm run db:migrate
   ============================================ */

-- ============================================
-- 1. ADD COLUMN workspace_id (nullable for backfill)
-- ============================================
ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS workspace_id UUID
    REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.rental_jobs
  ADD COLUMN IF NOT EXISTS workspace_id UUID
    REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.rental_job_items
  ADD COLUMN IF NOT EXISTS workspace_id UUID
    REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- ============================================
-- 2. Backfill from user_id → profiles.workspace_id
-- ============================================
UPDATE public.rental_inventory ri
SET workspace_id = p.workspace_id
FROM public.profiles p
WHERE ri.user_id = p.id AND ri.workspace_id IS NULL;

UPDATE public.rental_jobs rj
SET workspace_id = p.workspace_id
FROM public.profiles p
WHERE rj.user_id = p.id AND rj.workspace_id IS NULL;

/* rental_job_items has no user_id of its own — walk through
   rental_jobs to inherit its workspace_id. */
UPDATE public.rental_job_items rji
SET workspace_id = rj.workspace_id
FROM public.rental_jobs rj
WHERE rji.job_id = rj.id AND rji.workspace_id IS NULL;

-- ============================================
-- 3. Set NOT NULL + indexes for the new RLS pattern
-- ============================================
ALTER TABLE public.rental_inventory ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.rental_jobs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.rental_job_items ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rental_inventory_workspace
  ON public.rental_inventory (workspace_id);
CREATE INDEX IF NOT EXISTS idx_rental_jobs_workspace
  ON public.rental_jobs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_rental_job_items_workspace
  ON public.rental_job_items (workspace_id);

/* qr_token UNIQUE-within-workspace partial index from the 093
   companion migration — has to live here because it depends on
   the workspace_id column landing first. */
CREATE UNIQUE INDEX IF NOT EXISTS rental_inventory_qr_token_workspace_unique
  ON public.rental_inventory (workspace_id, qr_token)
  WHERE qr_token IS NOT NULL;

-- ============================================
-- 4. Canonical RLS swap
--
-- Drops every legacy user-scoped policy by name pattern + adds
-- the canonical 4-policy set (workspace-only S/I/U; workspace +
-- admin gate on D — rental data is destruction-sensitive per
-- Adam's product lock).
--
-- DROP POLICY IF EXISTS handles every plausible historical name
-- the prod tables might carry; canonical CREATE POLICY uses the
-- same per-table naming the rest of the codebase uses.
-- ============================================

-- rental_inventory
DROP POLICY IF EXISTS rental_inventory_user_select ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_user_insert ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_user_update ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_user_delete ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_workspace_member_select ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_workspace_member_insert ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_workspace_member_update ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_workspace_member_delete ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_select ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_insert ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_update ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_delete ON public.rental_inventory;

CREATE POLICY rental_inventory_select ON public.rental_inventory
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_inventory_insert ON public.rental_inventory
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_inventory_update ON public.rental_inventory
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_inventory_delete ON public.rental_inventory
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- rental_jobs
DROP POLICY IF EXISTS rental_jobs_user_select ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_user_insert ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_user_update ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_user_delete ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_workspace_member_select ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_workspace_member_insert ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_workspace_member_update ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_workspace_member_delete ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_select ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_insert ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_update ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_delete ON public.rental_jobs;

CREATE POLICY rental_jobs_select ON public.rental_jobs
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_jobs_insert ON public.rental_jobs
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_jobs_update ON public.rental_jobs
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_jobs_delete ON public.rental_jobs
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- rental_job_items
DROP POLICY IF EXISTS rental_job_items_user_select ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_user_insert ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_user_update ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_user_delete ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_workspace_member_select ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_workspace_member_insert ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_workspace_member_update ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_workspace_member_delete ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_select ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_insert ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_update ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_delete ON public.rental_job_items;

CREATE POLICY rental_job_items_select ON public.rental_job_items
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_job_items_insert ON public.rental_job_items
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_job_items_update ON public.rental_job_items
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_job_items_delete ON public.rental_job_items
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

/* ============================================
   Down migration — DO NOT auto-run; would lose RLS coverage.
   ============================================ */
-- (rebuild user-scoped policies from the 052/061 reference if
--  rolling back; the column drops are commented-out below.)
-- DROP INDEX IF EXISTS rental_inventory_qr_token_workspace_unique;
-- DROP INDEX IF EXISTS idx_rental_job_items_workspace;
-- DROP INDEX IF EXISTS idx_rental_jobs_workspace;
-- DROP INDEX IF EXISTS idx_rental_inventory_workspace;
-- ALTER TABLE public.rental_job_items DROP COLUMN IF EXISTS workspace_id;
-- ALTER TABLE public.rental_jobs DROP COLUMN IF EXISTS workspace_id;
-- ALTER TABLE public.rental_inventory DROP COLUMN IF EXISTS workspace_id;
