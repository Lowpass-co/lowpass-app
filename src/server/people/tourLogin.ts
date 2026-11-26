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
   syncPersonnelLogin: a crew record's login FOLLOWS ITS EMAIL (Nov 2026,
     Adam: added himself under an old email, fixed the email, and the invite
     still pointed at the old one). If the email is a login already in this
     workspace, the record is linked to it and any pending invite's access
     moves onto it (invite withdrawn — no link needed); otherwise a pending
     invite is re-addressed to the current email (same link).
   tourLoginStates: what the Crew list shows per person.
   ============================================ */

import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isArea, presetFor, accessForTour, type Preset, type TourAccessRow } from '@/lib/permissions/areas';
import { parseAccessRows } from '@/lib/permissions/accessRows';
import { mergeAccessRows, presetRows, type LoginState } from '@/lib/personnel/crew';

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
  // A typed email goes on the record first, so the login can follow it.
  if (emailIn?.trim()) {
    await supabase
      .from('personnel')
      .update({ email: emailIn.trim().toLowerCase() })
      .eq('id', personnelId)
      .eq('workspace_id', ctx.workspaceId)
      .is('email', null);
  }
  await syncPersonnelLogin(supabase, ctx.workspaceId, personnelId, ctx.actorUserId);

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
      // Admin / manager see every tour; a Member or a Tour manager (298) is
      // scoped by tour_access, so this tour is added to theirs.
      if (member.role === 'admin' || member.role === 'manager') return { kind: 'full' };
      const err = await addAccess(supabase, ctx.workspaceId, member.id, ctx.actorUserId, presetRows(ctx.tourId, preset));
      if (err) return { kind: 'error', error: err };
      await audit(supabase, ctx, 'tour_access', member.id, { tour_id: ctx.tourId, preset });
      return { kind: 'granted' };
    }
    // A login, but not in this workspace — invite them like anyone else.
  }

  /* No login here → invite. */
  const email = (emailIn?.trim() || person.email || '').toLowerCase();
  if (!EMAIL.test(email)) return { kind: 'error', error: 'Add an email to give them a login' };

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
    const readonlyIds = members.filter((m) => m.role === 'readonly' || m.role === 'tour_manager').map((m) => m.id);
    const { data: acc } = readonlyIds.length
      ? await supabase.from('tour_access').select('member_id, tour_id, area, level').in('member_id', readonlyIds)
      : { data: [] };
    const accRows = (acc ?? []) as Array<TourAccessRow & { member_id: string }>;
    for (const p of people) {
      const m = members.find((x) => x.user_id === p.user_id);
      if (!m) continue;
      if (m.role === 'admin' || m.role === 'manager') {
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

/** Merge `wanted` rows into a member's tour_access — never lowers. */
async function addAccess(
  supabase: SupabaseClient,
  workspaceId: string,
  memberId: string,
  actorUserId: string,
  wanted: ReadonlyArray<{ tour_id: string | null; area: string; level: string }>,
): Promise<string | null> {
  const { data: rows, error: readErr } = await supabase
    .from('tour_access')
    .select('id, tour_id, area, level')
    .eq('member_id', memberId);
  if (readErr) return readErr.message;
  const w = mergeAccessRows((rows ?? []) as Array<TourAccessRow & { id: string }>, wanted);
  if (w.insert.length) {
    const { error } = await supabase
      .from('tour_access')
      .insert(w.insert.map((r) => ({ ...r, member_id: memberId, workspace_id: workspaceId, granted_by: actorUserId })));
    if (error) return error.message;
  }
  if (w.raise.length) {
    const { error } = await supabase.from('tour_access').update({ level: 'edit' }).in('id', w.raise);
    if (error) return error.message;
  }
  return null;
}

export type SyncResult = 'linked' | 'retargeted' | 'none';

/**
 * A crew record's login follows its email. Call after the email changes and
 * before inviting. Admin-only data (the member list, invites): for anyone
 * else it finds nothing and does nothing.
 */
export async function syncPersonnelLogin(
  supabase: SupabaseClient,
  workspaceId: string,
  personnelId: string,
  actorUserId: string,
): Promise<SyncResult> {
  const { data: p } = await supabase
    .from('personnel')
    .select('id, email, user_id, workspace_id')
    .eq('id', personnelId)
    .maybeSingle();
  const person = p as { id: string; email: string | null; user_id: string | null; workspace_id: string } | null;
  if (!person || person.workspace_id !== workspaceId) return 'none';
  const email = (person.email ?? '').trim().toLowerCase();

  const { data: inv } = await supabase
    .from('workspace_invites')
    .select('id, invited_email, invited_role, initial_access')
    .eq('workspace_id', workspaceId)
    .eq('personnel_id', personnelId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString());
  const pending = (inv ?? []) as Array<{ id: string; invited_email: string; invited_role: string; initial_access: unknown }>;

  // 1. The email is already a login in this workspace → link it, no invite.
  if (!person.user_id && EMAIL.test(email)) {
    const { data: members } = await supabase.rpc('list_workspace_members', { p_workspace_id: workspaceId });
    const member = ((members ?? []) as Array<{ member_id: string; user_id: string; email: string | null; role: string }>).find(
      (m) => (m.email ?? '').toLowerCase() === email,
    );
    if (member) {
      // One login, one crew record per workspace: don't steal a login that
      // already has a record here.
      const { data: other } = await supabase
        .from('personnel')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', member.user_id)
        .neq('id', personnelId)
        .limit(1)
        .maybeSingle();
      if (!other) {
        const { error } = await supabase.from('personnel').update({ user_id: member.user_id }).eq('id', personnelId).is('user_id', null);
        if (!error) {
          if (member.role === 'readonly' || member.role === 'tour_manager') {
            const wanted = pending.flatMap((i) =>
              (i.invited_role === 'readonly' || i.invited_role === 'tour_manager') && Array.isArray(i.initial_access)
                ? (i.initial_access as Array<{ tour_id: string | null; area: string; level: string }>)
                : [],
            );
            if (wanted.length) await addAccess(supabase, workspaceId, member.member_id, actorUserId, wanted);
          }
          if (pending.length) await supabase.from('workspace_invites').delete().in('id', pending.map((i) => i.id));
          await audit(supabase, { workspaceId, tourId: '', actorUserId, origin: '' }, 'personnel', personnelId, {
            linked_user_id: member.user_id,
            withdrew_invites: pending.length,
          });
          return 'linked';
        }
      }
    }
  }

  // 2. A pending invite for an old address → the current one (same link).
  const stale = EMAIL.test(email) ? pending.filter((i) => i.invited_email !== email) : [];
  if (stale.length) {
    await supabase.from('workspace_invites').update({ invited_email: email }).in('id', stale.map((i) => i.id));
    return 'retargeted';
  }
  return 'none';
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
