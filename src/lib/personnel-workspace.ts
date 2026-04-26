/* Shared workspace personnel (roster) helpers for API routes. */

import type { createServerSupabaseClient } from '@/lib/supabase-server';

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export const DEFAULT_PERSONNEL_STANDARD_RATES = {
  show_day_rate: 0,
  off_day_rate: 0,
  travel_day_rate: 0,
  per_diem_rate: 0,
  currency: 'GBP',
};

export async function nextPersonnelLpId(supabase: Supabase, workspaceId: string): Promise<string> {
  const { data } = await supabase.from('personnel').select('lp_id').eq('workspace_id', workspaceId);
  let max = 0;
  for (const row of data ?? []) {
    const m = /^LP-(\d+)$/i.exec((row as { lp_id: string }).lp_id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `LP-${String(max + 1).padStart(5, '0')}`;
}

/** Escape % and _ so ilike treats the string as a literal name, not a pattern. */
function escapeIlikeLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Find an existing workspace personnel row by case-insensitive trimmed name, or create one.
 * Used when adding someone to a tour without an explicit roster_personnel_id.
 */
export async function findOrCreateWorkspacePersonnelByName(
  supabase: Supabase,
  workspaceId: string,
  name: string,
  roleHint: string | null
): Promise<{ id: string; name: string; role: string | null; standard_rates: unknown }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required');

  const pattern = escapeIlikeLiteral(trimmed);
  const { data: candidates, error: qerr } = await supabase
    .from('personnel')
    .select('id, name, role, standard_rates')
    .eq('workspace_id', workspaceId)
    .ilike('name', pattern);

  if (qerr) throw new Error(qerr.message);

  const found = (candidates ?? []).find(
    (r) => String((r as { name: string }).name).trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (found) {
    return found as { id: string; name: string; role: string | null; standard_rates: unknown };
  }

  const lp_id = await nextPersonnelLpId(supabase, workspaceId);
  const standard_rates = { ...DEFAULT_PERSONNEL_STANDARD_RATES };
  const insert = {
    workspace_id: workspaceId,
    lp_id,
    name: trimmed,
    role: roleHint?.trim() ? roleHint.trim() : '',
    email: null as string | null,
    phone: null as string | null,
    home_airport: null as string | null,
    dietary_needs: null as string | null,
    merch_size: null as string | null,
    preferences: null as string | null,
    standard_rates,
    passport_info: {},
    extended_profile: {},
  };

  let { data: created, error } = await supabase
    .from('personnel')
    .insert(insert)
    .select('id, name, role, standard_rates')
    .single();

  if (
    error &&
    (error.message?.includes('extended_profile') || error.message?.includes('schema cache'))
  ) {
    const { extended_profile: _e, ...withoutExt } = insert;
    const retry = await supabase
      .from('personnel')
      .insert(withoutExt)
      .select('id, name, role, standard_rates')
      .single();
    created = retry.data;
    error = retry.error;
  }

  if (error) throw new Error(error.message);
  if (!created) throw new Error('Failed to create personnel');
  return created as { id: string; name: string; role: string | null; standard_rates: unknown };
}
