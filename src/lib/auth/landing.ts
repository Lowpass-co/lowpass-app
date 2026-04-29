/* ============================================
   LOWPASS — Post-auth landing resolver

   Determines where a freshly authed user should land based on the
   number of artists in their workspace:

     0 artists  → /artists?onboard=1   (first-artist onboarding flow)
     1 artist   → /artists/[that-id]   (skip the picker, drop them into
                                        their only artist's hub)
     2+ artists → /artists             (picker)

   A `?next=` override on the entry route bypasses this logic so deep
   links survive the auth round-trip. The caller is responsible for
   validating that `next` is a same-origin path before honouring it.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolvePostAuthLanding(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  // Profile carries the workspace_id. If the user's signup never
  // completed (no profile row, or no workspace), drop them onto the
  // onboarding flow.
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .single();

  if (!profile?.workspace_id) return '/artists?onboard=1';

  // limit(2) — we only need to distinguish 0 / 1 / 2+, and capping
  // the read keeps the redirect cheap for workspaces with many
  // artists.
  const { data: artists } = await supabase
    .from('artists')
    .select('id')
    .eq('workspace_id', profile.workspace_id)
    .order('name')
    .limit(2);

  if (!artists || artists.length === 0) return '/artists?onboard=1';
  if (artists.length === 1) return `/artists/${artists[0].id}`;
  return '/artists';
}
