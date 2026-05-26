/* ============================================
   LOWPASS — getWorkspaceName (IA Cleanup §I2)

   Light helper for the (workspace) layout — just the
   workspace's display name, no card-grid data fetch. Used
   to feed <WorkspaceTopBar workspaceName={...} />.

   Heavier server-side fetcher
   (src/server/workspace/getWorkspaceLandingData.ts) still
   drives the artists landing card content; layouts shouldn't
   pull all of that just to render a header.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function getWorkspaceName(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle<{ workspace_id: string | null }>();
  const workspaceId = profile?.workspace_id;
  if (!workspaceId) return null;

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .maybeSingle<{ name: string | null }>();
  return workspace?.name ?? null;
}
