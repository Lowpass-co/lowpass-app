-- ============================================================
-- 241_tour_files_bucket.sql  (Grade-response G1-A #2)
--
-- The `tour-files` Storage bucket + RLS for tour/artist file uploads
-- (/api/files). Idempotent / re-runnable — hand-pasted into the Supabase SQL
-- editor like every migration in this repo.
--
-- Path convention (set by /api/files): {workspace_id}/{tour|artist}/{id}/{file}
-- so the first folder segment is the workspace id — that's what the policies gate.
-- ============================================================

-- Bucket (private). If it already exists this is a no-op.
insert into storage.buckets (id, name, public)
values ('tour-files', 'tour-files', false)
on conflict (id) do nothing;

-- RLS on storage.objects is already enabled globally by Supabase; we only add
-- the per-bucket, workspace-scoped policies. Drop-then-create so re-paste is safe.

drop policy if exists "tour_files_select_own_workspace" on storage.objects;
create policy "tour_files_select_own_workspace"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'tour-files'
    and (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  );

drop policy if exists "tour_files_insert_own_workspace" on storage.objects;
create policy "tour_files_insert_own_workspace"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tour-files'
    and (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  );

drop policy if exists "tour_files_delete_own_workspace" on storage.objects;
create policy "tour_files_delete_own_workspace"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'tour-files'
    and (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  );

-- Down (manual):
--   drop policy if exists "tour_files_select_own_workspace" on storage.objects;
--   drop policy if exists "tour_files_insert_own_workspace" on storage.objects;
--   drop policy if exists "tour_files_delete_own_workspace" on storage.objects;
--   delete from storage.buckets where id = 'tour-files';
