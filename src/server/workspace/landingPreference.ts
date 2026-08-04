/* ============================================
   LOWPASS — the empty-workspace landing prompt

   An invited member could land in their own auto-provisioned workspace and see
   an empty app: no artists, no venues, no tours. The accept route now switches
   them (see /api/workspaces/invite/accept and migration 254), but that only
   helps accepts from here on. Anyone already stranded — and anyone who signed
   up before accepting an older invite — still opens the wrong tenant.

   WHY A PROMPT AND NOT A REDIRECT. A rule that silently moves you must never
   fight a deliberate choice: if someone switches INTO their own empty workspace
   to set it up, being yanked back out every landing is worse than the phantom,
   and it is the kind of thing people cannot describe when they report it.
   Making the correction genuinely one-time needs new state — a column, so a
   migration, so a paste — and this must not wait on that. A prompt needs no
   state, cannot trap anyone, and is honest about what it knows.

   WHY THIS IS NOT IN getActiveMembership. The active workspace stays exactly
   one readable field: profiles.workspace_id. If "which workspace am I in"
   became a rule evaluation rather than a field read, every future tenancy bug
   would cost what the invite bug cost before the scalar was found — and cost it
   every time, because nobody could just look. This computes a SUGGESTION for
   one banner. It resolves nothing, and it writes nothing: the switch itself
   goes through /api/workspaces/switch like any other, one scalar write.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export type LandingSuggestion = {
  currentName: string;
  targetId: string;
  targetName: string;
};

/** Non-empty means ANY of these exist. Deliberately generous: a workspace with
 *  a single artist is somebody's real workspace and must never be suggested
 *  away from. */
const EMPTY_PROBES = ['artists', 'tours', 'venues'] as const;

export async function getLandingSuggestion(
  supabase: SupabaseClient,
  userId: string,
): Promise<LandingSuggestion | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .maybeSingle();
  const activeId = (profile as { workspace_id?: string | null } | null)?.workspace_id ?? null;
  if (!activeId) return null;

  /* Only ever suggests when the user genuinely has somewhere else to go. */
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId);
  const others = (memberships ?? [])
    .map((m) => (m as { workspace_id: string }).workspace_id)
    .filter((id) => id !== activeId);
  if (others.length !== 1) return null; // 0 = nowhere to go; 2+ = their choice to make

  for (const table of EMPTY_PROBES) {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', activeId);
    if ((count ?? 0) > 0) return null; // not empty — this is a real workspace
  }

  const { data: names } = await supabase
    .from('workspaces')
    .select('id, name')
    .in('id', [activeId, others[0]]);
  const byId = new Map((names ?? []).map((w) => [(w as { id: string }).id, (w as { name: string }).name]));
  const currentName = byId.get(activeId);
  const targetName = byId.get(others[0]);
  if (!currentName || !targetName) return null;

  return { currentName, targetId: others[0], targetName };
}
