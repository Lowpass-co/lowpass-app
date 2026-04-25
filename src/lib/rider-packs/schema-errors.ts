/* ============================================
   Detect PostgREST / Supabase "schema cache" errors for rider_folders
   (migration 039 not applied) so API routes can return a clear 503.
   ============================================ */

export function isRiderFoldersMissingError(message: string | undefined): boolean {
  if (!message) return false;
  if (!/rider_folders/i.test(message)) return false;
  if (/schema cache|does not exist|not find the table|42P01|PGRST205/i.test(message)) return true;
  return false;
}

export const RIDER_FOLDERS_SETUP_MESSAGE =
  'Rider folders are not set up in this environment. In Supabase SQL, run database/migrations/039_rider_folders.sql, then run: NOTIFY pgrst, \'reload schema\';';
