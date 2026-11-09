/* ============================================
   LOWPASS — where a person edit lands (Nov 2026, Adam)

   Crew, Payroll and People used to each keep their own copy of a person's
   name and role. Now every edit goes to ONE place, and migration 285's
   triggers carry it everywhere else:

     name        → the People record (personnel.name). Renames them on every
                   tour, in Rooming, Payroll and ⌘K.
     role        → THIS tour's roster row (tour_personnel.role). Never the
                   person: their default role is edited on People only, and
                   only seeds new tours.
     employment  → THIS tour's payroll card (personnel_rates.person_type).

   Nothing here writes persons or a card's role / name — the triggers do.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmployment } from '@/lib/personnel/employment';

export type EditResult = { ok: true } | { ok: false; status: number; error: string };

const fail = (status: number, error: string): EditResult => ({ ok: false, status, error });

/** Role on this tour. A person can hold several roles on one tour, but not
 *  the same one twice. */
export async function setTourRole(supabase: SupabaseClient, tourPersonnelId: string, role: unknown): Promise<EditResult> {
  const next = typeof role === 'string' ? role.trim() : '';
  if (!next) return fail(400, 'Role can’t be blank.');
  const { data, error } = await supabase.from('tour_personnel').update({ role: next }).eq('id', tourPersonnelId).select('id');
  if (error) {
    if (error.code === '23505') return fail(409, `They’re already on this tour as ${next}.`);
    return fail(500, error.message);
  }
  if (!data || data.length === 0) return fail(404, 'Not on this tour.');
  return { ok: true };
}

/** Employment on this tour (Principal / Band / Crew), on the payroll card. */
export async function setTourEmployment(supabase: SupabaseClient, tourPersonnelId: string, employment: unknown): Promise<EditResult> {
  if (!isEmployment(employment)) return fail(400, 'Employment must be principal, band or crew.');
  const { error } = await supabase.from('personnel_rates').update({ person_type: employment }).eq('tour_personnel_id', tourPersonnelId);
  if (error) return fail(500, error.message);
  return { ok: true };
}

/** The person's name, on their People record. */
export async function renamePerson(
  supabase: SupabaseClient,
  workspaceId: string,
  personId: string,
  name: unknown,
): Promise<EditResult> {
  const next = typeof name === 'string' ? name.trim() : '';
  if (!next) return fail(400, 'Name can’t be blank.');
  const { data, error } = await supabase
    .from('personnel')
    .update({ name: next, updated_at: new Date().toISOString() })
    .eq('id', personId)
    .eq('workspace_id', workspaceId)
    .select('id');
  if (error) return fail(500, error.message);
  if (!data || data.length === 0) return fail(404, 'This person isn’t in People.');
  return { ok: true };
}
