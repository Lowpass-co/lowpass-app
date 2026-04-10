/** Supabase/PostgREST errors when `personnel_rates.roster_personnel_id` is not migrated yet. */
export function isMissingRosterPersonnelIdColumn(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return m.includes('roster_personnel_id') && (m.includes('schema') || m.includes('column'));
}
