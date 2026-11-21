/* ============================================
   LOWPASS — A crew member's login for ONE tour (Nov 2026, Adam)

   Used by the Add crew panel (per person, optional) and the crew member's
   panel. Admin only — the database already insists: workspace_invites and
   tour_access are writable by workspace admins only (078 / 292). Callers
   check `admin` first so a manager gets a clear message, not an RLS error.

   giveTourLogin(preset):
     - their crew record has a login in this workspace:
         admin / manager → nothing to do ("sees every tour")
         member          → this tour's areas added (accessWrites — never lowers)
     - no login yet → an invite (Member, linked to the crew record, this tour
       only). A pending invite for the same email is REUSED: this tour is
       merged into it, so one person never holds two links. The app doesn't
       send email — the caller shows the link to copy.
   removeTourLogin: takes THIS tour off a member's access / a pending invite.
   tourLoginStates: what the Crew list shows per person.
   ============================================ */

import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isArea, presetFor, accessForTour, type Preset, type TourAccessRow } from '@/lib/permissions/areas';
import { parseAccessRows } from '@/lib/permissions/accessRows';
import { accessWrites, presetRows, type LoginState } from '@/lib/personnel/crew';

export type { LoginState };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginResult =
  | { kind: 'full' }
  | { kind: 'granted' }
  | { kind: 'invited'; url: string; reused: boolean }
  | { kind: 'error'; error: string };

type Ctx = { workspaceId: string; tourId: string; actorUserId: string; origin: string };

function inviteUrl(origin: string, token: string): string {
  return `${origin}/invite/accept?token=${encodeURIComponent(token)}`;
}

export async function giveTourLogin(
  supabase: SupabaseClient,
  ctx: Ctx,
  personnelId: string,
  preset: Preset,
  emailIn?: string | null,
): Promise<LoginResult> {
  const { data: p } = await supabase
    .from('personnel')
    .select('id, email, user_id, workspace_id')
    .eq('id', personnelId)
    .maybeSingle();
  const person = p as { id: string; email: string | null; user_id: string | null; workspace_id: string } | null;
  if (!person || person.workspace_id !== ctx.workspaceId) return { kind: 'error', error: 'Crew record not found' };

  /* Already has a login here → grant on the membership. */
  if (person.user_id) {
    const { data: mem } = await supabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', person.user_id)
      .maybeSingle();
    const member = mem as { id: string; role: string } | null;
    if (member) {
      if (member.role !== 'readonly') return { kind: 'full' };
      const { data: rows, error: readErr } = await supabase
        .from('tour_access')
        .select('id, tour_id, area, level')
        .eq('member_id', member.id);
      if (readErr) return { kind: 'error', error: readErr.message };
      const w = accessWrites((rows ?? []) as Array<TourAccessRow & { id: string }>, ctx.tourId, preset);
      if (w.insert.length) {
        const { error } = await supabase.from('tour_access').insert(
          w.insert.map((r) => ({
            ...r,
            tour_id: ctx.tourId,
            member_id: member.id,
            workspace_id: ctx.workspaceId,
            granted_by: ctx.actorUserId,
          })),
        );
        if (error) return { kind: 'error', error: error.message };
      }
      if (w.raise.length) {
        const { error } = await supabase.from('tour_access').update({ level: 'edit' }).in('id', w.raise);
        if (error) return { kind: 'error', error: error.message };
      }
      await audit(supabase, ctx, 'tour_access', member.id, { tour_id: ctx.tourId, preset });
      return { kind: 'granted' };
    }
    // A login, but not in this workspace — invite them like anyone else.
  }

  /* No login here → invite. */
  const email = (emailIn?.trim() || person.email || '').toLowerCase();
  if (!EMAIL.test(email)) return { kind: 'error', error: 'Add an email to give them a login' };
  if (!person.email) await supabase.from('personnel').update({ email }).eq('id', person.id);

  const rows = presetRows(ctx.tourId, preset);
  const { data: pending } = await supabase
    .from('workspace_invites')
    .select('id, token, initial_access, personnel_id, invited_role')
    .eq('workspace_id', ctx.workspaceId)
    .eq('invited_email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const inv = pending as {
    id: string;
    token: string;
    initial_access: unknown;
    personnel_id: string | null;
    invited_role: string;
  } | null;

  if (inv) {
    if (inv.invited_role !== 'readonly') {
      // Invited as admin / manager already — they'll see every tour.
      return { kind: 'invited', url: inviteUrl(ctx.origin, inv.token), reused: true };
    }
    const merged = parseAccessRows([...(Array.isArray(inv.initial_access) ? inv.initial_access : []), ...rows]);
    if (typeof merged === 'string') return { kind: 'error', error: merged };
    const { error } = await supabase
      .from('workspace_invites')
      .update({ initial_access: merged, ...(inv.personnel_id ? {} : { personnel_id: person.id }) })
      .eq('id', inv.id);
    if (error) return { kind: 'error', error: error.message };
    await audit(supabase, ctx, 'workspace_invite', inv.id, { tour_id: ctx.tourId, preset });
    return { kind: 'invited', url: inviteUrl(ctx.origin, inv.token), reused: true };
  }

  const token = randomBytes(32).toString('base64url');
  const { data: ins, error } = await supabase
    .from('workspace_invites')
    .insert({
      workspace_id: ctx.workspaceId,
      invited_email: email,
      invited_role: 'readonly',
      personnel_id: person.id,
      initial_access: rows,
      token,
      invited_by_user_id: ctx.actorUserId,
      expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    })
    .select('id')
    .single();
  if (error || !ins) {
    return { kind: 'error', error: error?.code === '42501' ? 'Only admins can give app access' : error?.message ?? 'Could not invite' };
  }
  await audit(supabase, ctx, 'workspace_invite', (ins as { id: string }).id, { invited_email: email, tour_id: ctx.tourId, preset });
  return { kind: 'invited', url: inviteUrl(ctx.origin, token), reused: false };
}

/** Take THIS tour off a member's access, or out of their pending invite. */
export async function removeTourLogin(
  supabase: SupabaseClient,
  ctx: Ctx,
  personnelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = (await tourLoginStates(supabase, ctx, [personnelId]))[personnelId];
  if (!state || state.state === 'none') return { ok: true };
  if (state.state === 'full') return { ok: false, error: 'Admins and managers see every tour — change their role in Team & roles' };
  if (state.state === 'member' && state.memberId) {
    const { error } = await supabase.from('tour_access').delete().eq('member_id', state.memberId).eq('tour_id', ctx.tourId);
    if (error) return { ok: false, error: error.message };
  }
  if (state.state === 'invited' && state.inviteId) {
    const { data } = await supabase.from('workspace_invites').select('initial_access').eq('id', state.inviteId).maybeSingle();
    const rows = Array.isArray((data as { initial_access?: unknown } | null)?.initial_access)
      ? ((data as { initial_access: Array<{ tour_id?: string | null }> }).initial_access)
      : [];
    const left = rows.filter((r) => r.tour_id !== ctx.tourId);
    // Nothing left to see → withdraw the invite rather than leave a login with no tours.
    const { error } = left.length
      ? await supabase.from('workspace_invites').update({ initial_access: left }).eq('id', state.inviteId)
      : await supabase.from('workspace_invites').delete().eq('id', state.inviteId);
    if (error) return { ok: false, error: error.message };
  }
  await audit(supabase, ctx, 'tour_access', personnelId, { tour_id: ctx.tourId, removed: true });
  return { ok: true };
}

/**
 * Login state on this tour for each crew record. Reads what RLS lets the
 * caller read: an admin sees members' tour access and pending invites; a
 * manager sees only whether there is a login (state 'member' with preset null).
 */
export async function tourLoginStates(
  supabase: SupabaseClient,
  ctx: Pick<Ctx, 'workspaceId' | 'tourId' | 'origin'>,
  personnelIds: string[],
): Promise<Record<string, LoginState>> {
  const out: Record<string, LoginState> = {};
  if (!personnelIds.length) return out;
  for (const id of personnelIds) out[id] = { state: 'none', preset: null };

  const { data: ppl } = await supabase.from('personnel').select('id, user_id, email').in('id', personnelIds);
  const people = (ppl ?? []) as Array<{ id: string; user_id: string | null; email: string | null }>;
  const userIds = people.map((p) => p.user_id).filter((u): u is string => !!u);

  if (userIds.length) {
    const { data: mems } = await supabase
      .from('workspace_members')
      .select('id, user_id, role')
      .eq('workspace_id', ctx.workspaceId)
      .in('user_id', userIds);
    const members = (mems ?? []) as Array<{ id: string; user_id: string; role: string }>;
    const readonlyIds = members.filter((m) => m.role === 'readonly').map((m) => m.id);
    const { data: acc } = readonlyIds.length
      ? await supabase.from('tour_access').select('member_id, tour_id, area, level').in('member_id', readonlyIds)
      : { data: [] };
    const accRows = (acc ?? []) as Array<TourAccessRow & { member_id: string }>;
    for (const p of people) {
      const m = members.find((x) => x.user_id === p.user_id);
      if (!m) continue;
      if (m.role !== 'readonly') {
        out[p.id] = { state: 'full', preset: null, memberId: m.id };
        continue;
      }
      const access = accessForTour(accRows.filter((r) => r.member_id === m.id && isArea(r.area)), ctx.tourId);
      const any = Object.keys(access).length > 0;
      out[p.id] = { state: 'member', preset: any ? presetFor(access) ?? 'custom' : null, memberId: m.id };
    }
  }

  // Pending invites (admin-readable only; a manager gets none back).
  const { data: invs } = await supabase
    .from('workspace_invites')
    .select('id, token, personnel_id, invited_role, initial_access')
    .eq('workspace_id', ctx.workspaceId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .in('personnel_id', personnelIds);
  for (const i of (invs ?? []) as Array<{ id: string; token: string; personnel_id: string; invited_role: string; initial_access: unknown }>) {
    if (out[i.personnel_id]?.state !== 'none') continue;
    const rows = (Array.isArray(i.initial_access) ? i.initial_access : []) as TourAccessRow[];
    const access = accessForTour(rows, ctx.tourId);
    const any = Object.keys(access).length > 0;
    out[i.personnel_id] = {
      state: 'invited',
      // Invited as admin / manager → every tour; shown without a preset.
      preset: i.invited_role !== 'readonly' ? null : any ? presetFor(access) ?? 'custom' : null,
      inviteId: i.id,
      inviteUrl: inviteUrl(ctx.origin, i.token),
    };
  }
  return out;
}

async function audit(supabase: SupabaseClient, ctx: Ctx, entity: string, id: string, changes: Record<string, unknown>) {
  await supabase.from('audit_log').insert({
    workspace_id: ctx.workspaceId,
    actor_user_id: ctx.actorUserId,
    action: 'updated',
    entity_type: entity,
    entity_id: id,
    field_changes: changes,
  });
}
