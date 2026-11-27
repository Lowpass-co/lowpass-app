/* ============================================
   LOWPASS — Putting people on a tour's crew (Nov 2026, Adam)

   ONE place a tour_personnel row is made: the single add route
   (POST /api/tours/[id]/personnel) and the Add crew panel's batch route
   (POST /api/tours/[id]/personnel/add) both call addPersonToTour.

   - Role: as typed, else the person's usual role (People), else "Crew".
   - Role tag: as given, else worked out from the role (inferRoleTag).
   - Employment (Principal / Band / Crew) from the person's groups.
   - Status is RETIRED (Adam, Nov 2026: "I wouldn't add someone tentatively,
     and I can remove them easily"). The column stays; every new row is
     'confirmed' and nothing reads it.
   - The payroll card is seeded from the person's LAST tour (rates are
     typed only in Payroll); best-effort — the roster row is what matters.

   Callers own auth (admin / manager) and the derived-lines refresh.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isRoleTag, type RoleTag } from '@/lib/personnel/role-tags';
import { inferRoleTag } from '@/lib/personnel/crew';
import { employmentFromGroups, groupsOf, type Employment } from '@/lib/personnel/employment';
import { lastTourSeed, insertSeedLines } from '@/server/payroll/seedRateCard';
import { DEFAULT_PERSONNEL_STANDARD_RATES, nextPersonnelLpId } from '@/lib/personnel-workspace';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AddInput = {
  tourId: string;
  workspaceId: string;
  personId: string;
  role?: string | null;
  roleTag?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
  actorUserId: string;
};

export type AddResult =
  | { ok: true; id: string; role: string; rateCard: Record<string, unknown> | null }
  | { ok: false; status: number; error: string };

function date(v: unknown): string | null {
  return typeof v === 'string' && ISO_DATE.test(v) ? v : null;
}

export async function addPersonToTour(supabase: SupabaseClient, input: AddInput): Promise<AddResult> {
  const { tourId, workspaceId, personId } = input;

  // People (`personnel`) is the master; `persons` is the database's copy with
  // the same id (migration 285), which tour_personnel.person_id points at.
  const { data: master } = await supabase
    .from('personnel')
    .select('id, workspace_id, name, role, extended_profile')
    .eq('id', personId)
    .maybeSingle();
  const m = master as { workspace_id: string; name?: string | null; role?: string | null; extended_profile?: unknown } | null;
  if (!m) return { ok: false, status: 404, error: 'Person not found' };
  if (m.workspace_id !== workspaceId) {
    return { ok: false, status: 400, error: 'Person belongs to a different workspace' };
  }
  const role = input.role?.trim() || m?.role?.trim() || 'Crew';
  const roleTag: RoleTag = isRoleTag(input.roleTag) ? input.roleTag : inferRoleTag(role);
  const employment: Employment = employmentFromGroups(groupsOf(m?.extended_profile));
  const startsOn = date(input.startsOn);
  const endsOn = date(input.endsOn);
  if (startsOn && endsOn && endsOn < startsOn) {
    return { ok: false, status: 400, error: 'The end date is before the start date' };
  }

  const { data: inserted, error } = await supabase
    .from('tour_personnel')
    .insert({
      workspace_id: workspaceId,
      tour_id: tourId,
      person_id: personId,
      role,
      role_tag: roleTag,
      rate_currency: 'GBP',
      rate_period: null,
      starts_on: startsOn,
      ends_on: endsOn,
      status: 'confirmed',
    })
    .select('id')
    .single();
  if (error || !inserted) {
    // UNIQUE (tour_id, person_id, role)
    if (error?.code === '23505') return { ok: false, status: 409, error: 'Already on this tour in that role' };
    // 23503 on person_id: the People record has no `persons` copy — 285's
    // trigger is missing (Nov 2026; migration 305 repairs it). Say so plainly
    // rather than show the constraint name.
    if (error?.code === '23503') return { ok: false, status: 500, error: 'Couldn’t add them — their People record isn’t set up for tours yet (database repair 305 needed).' };
    return { ok: false, status: 500, error: error?.message ?? 'Could not add' };
  }
  const id = (inserted as { id: string }).id;

  await supabase.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_user_id: input.actorUserId,
    action: 'created',
    entity_type: 'tour_personnel',
    entity_id: id,
    field_changes: { tour_id: tourId, person_id: personId, role },
  });

  /* Seed (or relink) the payroll card so they appear in Payroll at once. */
  let rateCard: Record<string, unknown> | null = null;
  try {
    const personName = m.name?.trim() || role;
    const { data: existingRate } = await supabase
      .from('personnel_rates')
      .select('id')
      .eq('tour_id', tourId)
      .eq('person_id', personId)
      .maybeSingle();
    if (existingRate) {
      const { data } = await supabase
        .from('personnel_rates')
        .update({ tour_personnel_id: id })
        .eq('id', (existingRate as { id: string }).id)
        .select('*')
        .maybeSingle();
      rateCard = data as Record<string, unknown> | null;
    } else {
      const seed = await lastTourSeed(supabase, { workspaceId, tourId, personId });
      const { data } = await supabase
        .from('personnel_rates')
        .insert({
          tour_id: tourId,
          workspace_id: workspaceId,
          person_name: personName,
          role,
          person_type: employment,
          person_id: personId,
          tour_personnel_id: id,
          per_diem: seed.perDiem,
        })
        .select('*')
        .maybeSingle();
      rateCard = data as Record<string, unknown> | null;
      const cardId = (rateCard as { id?: string } | null)?.id;
      if (cardId) await insertSeedLines(supabase, { workspaceId, tourId, cardId, seed });
    }
  } catch {
    /* best-effort — the roster row is what matters */
  }

  return { ok: true, id, role, rateCard };
}

/** A new People record (the `persons` copy is made by migration 285's trigger). */
export async function createPerson(
  supabase: SupabaseClient,
  workspaceId: string,
  fields: { name: string; email?: string | null; phone?: string | null; role?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = fields.name.trim();
  if (!name) return { ok: false, error: 'Name is required' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const lp_id = await nextPersonnelLpId(supabase, workspaceId);
    const { data, error } = await supabase
      .from('personnel')
      .insert({
        workspace_id: workspaceId,
        lp_id,
        name,
        role: fields.role?.trim() ?? '',
        email: fields.email?.trim().toLowerCase() || null,
        phone: fields.phone?.trim() || null,
        standard_rates: { ...DEFAULT_PERSONNEL_STANDARD_RATES },
        passport_info: {},
        extended_profile: {},
      })
      .select('id')
      .single();
    if (!error && data) return { ok: true, id: (data as { id: string }).id };
    if (error?.code !== '23505') return { ok: false, error: error?.message ?? 'Could not create person' };
    // Duplicate lp_id (two adds at once) — take the next number and retry once.
  }
  return { ok: false, error: 'Could not create person — try again' };
}
