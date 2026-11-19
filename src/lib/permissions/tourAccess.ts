/* ============================================
   LOWPASS — "my access on this tour", read from the database (Nov 2026)

   The app never decides access itself: it asks `public.my_tour_access`
   (migration 292), which reads the same `tour_access` rows the database
   rules (293) enforce. Menu, page gate and route checks all come here.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AREAS, FULL_ACCESS, isArea, isLevel, type Area, type Level, type TourAccess } from './areas';

export type ViewerAccess = {
  /** Admin or manager of the active workspace — everything, every tour. */
  manager: boolean;
  role: 'admin' | 'manager' | 'readonly' | null;
  /** This tour's areas (FULL for managers; empty without a tour). */
  tour: TourAccess;
};

type RpcRow = { area: string; level: string };

/** Turn my_tour_access rows into area → level (unknown values dropped). */
export function accessFromRows(rows: readonly RpcRow[] | null | undefined): TourAccess {
  const out: TourAccess = {};
  for (const r of rows ?? []) {
    if (!isArea(r.area) || !isLevel(r.level)) continue;
    if (out[r.area] !== 'edit') out[r.area] = r.level;
  }
  return out;
}

/**
 * The viewer's role in their active workspace and their access on `tourId`.
 * Returns null when there is no signed-in member, or when the database can't
 * answer (292 not pasted yet) — callers treat null as "don't hide anything",
 * because the database rules are the real gate.
 */
export async function getViewerAccess(
  supabase: SupabaseClient,
  userId: string,
  tourId: string | null,
): Promise<ViewerAccess | null> {
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', userId).maybeSingle();
  const workspaceId = (profile as { workspace_id: string | null } | null)?.workspace_id ?? null;
  if (!workspaceId) return null;
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const role = ((member as { role?: string } | null)?.role ?? null) as ViewerAccess['role'];
  if (!role) return null;
  if (role === 'admin' || role === 'manager') return { manager: true, role, tour: FULL_ACCESS };
  if (!tourId) return { manager: false, role, tour: {} };
  const { data, error } = await supabase.rpc('my_tour_access', { p_tour_id: tourId });
  if (error) return null;
  return { manager: false, role, tour: accessFromRows(data as RpcRow[]) };
}

/** May the viewer do `level` in `area`? Unknown access (null) → yes (fail open
 *  on display only — never use this to authorise a write; see requireWrite). */
export function viewerCan(access: ViewerAccess | null, area: Area, level: Level = 'view'): boolean {
  if (!access) return true;
  if (access.manager) return true;
  const have = access.tour[area];
  return !!have && (level === 'view' || have === 'edit');
}

/** The same question for AUTHORISING (a page's read, a route): unknown access
 *  (null — no membership, the RPC failed) is NO. Use this, not viewerCan, for
 *  anything that decides what data a member gets (Nov 2026: the pages that
 *  still read the old Sprint 9 grants moved onto tour access). */
export function viewerAllows(access: ViewerAccess | null, area: Area, level: Level = 'view'): boolean {
  if (!access) return false;
  return viewerCan(access, area, level);
}

export const ALL_AREAS: readonly Area[] = AREAS;
