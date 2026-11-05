/* ============================================
   LOWPASS — Getting started: the facts (Nov 2026)

   Read-only. Answers "does this exist yet?" for each checklist step, scoped
   to one workspace, with count-only queries (head + exact count, no rows
   fetched) except the two "latest" lookups that give the links somewhere to
   go. Writes nothing.

   routing has no workspace_id, so show dates are counted through the
   workspace's tour ids.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OnboardingStatus, StepId } from '@/lib/onboarding/checklist';

/** How long after joining a member still counts as new (the welcome may open). */
export const NEW_MEMBER_DAYS = 14;

async function has(q: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string): Promise<boolean> {
  const { count, error } = await q;
  if (error) throw new Error(`${what}: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function loadOnboardingStatus(
  client: SupabaseClient,
  args: { workspaceId: string; userId: string; role: 'admin' | 'manager' | 'readonly'; now?: Date },
): Promise<OnboardingStatus> {
  const { workspaceId: ws, userId, role } = args;
  const now = args.now ?? new Date();

  const [artistRes, toursRes, memberRes] = await Promise.all([
    client.from('artists').select('id').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(1),
    client.from('tours').select('id, created_at').eq('workspace_id', ws).order('created_at', { ascending: false }),
    client.from('workspace_members').select('created_at').eq('workspace_id', ws).eq('user_id', userId).maybeSingle(),
  ]);
  if (artistRes.error) throw new Error(`artists: ${artistRes.error.message}`);
  if (toursRes.error) throw new Error(`tours: ${toursRes.error.message}`);
  if (memberRes.error) throw new Error(`membership: ${memberRes.error.message}`);

  const tourIds = ((toursRes.data ?? []) as { id: string }[]).map((t) => t.id);
  const artistId = ((artistRes.data ?? []) as { id: string }[])[0]?.id ?? null;
  const tourId = tourIds[0] ?? null;

  const count = { count: 'exact' as const, head: true };
  const [show, advance, receipt, invited, members] = await Promise.all([
    tourIds.length
      ? has(client.from('routing').select('id', count).in('tour_id', tourIds).in('day_type', ['show', 'festival']), 'show dates')
      : Promise.resolve(false),
    has(client.from('advance_intake_links').select('id', count).eq('workspace_id', ws).neq('status', 'revoked'), 'advance links'),
    has(client.from('expense_receipts').select('id', count).eq('workspace_id', ws), 'receipts'),
    has(client.from('workspace_invites').select('id', count).eq('workspace_id', ws), 'invites'),
    client.from('workspace_members').select('id', count).eq('workspace_id', ws).then((r) => {
      if (r.error) throw new Error(`members: ${r.error.message}`);
      return (r.count ?? 0) > 1;
    }),
  ]);

  const joined = (memberRes.data as { created_at?: string } | null)?.created_at;
  const newMember = joined ? now.getTime() - new Date(joined).getTime() < NEW_MEMBER_DAYS * 86_400_000 : false;

  const done: Record<StepId, boolean> = {
    artist: artistId !== null,
    tour: tourId !== null,
    show,
    advance,
    receipt,
    team: invited || members,
  };
  return { canSetUp: role === 'admin' || role === 'manager', newMember, artistId, tourId, done };
}
