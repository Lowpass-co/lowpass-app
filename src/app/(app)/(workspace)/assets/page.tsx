/* ============================================
   LOWPASS — Assets (S1 Stage C2)

   The one Assets surface over the unified Spaces → Containers → Items model
   (migs 246-250). Replaces the /equipment inventory tab + the gear library
   (nav cutover + retirement in Stage C3). Inherits workspace chrome from the
   (workspace) route group.
   ============================================ */

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadAssets } from '@/lib/spaces/loadAssets';
import { AssetsClient } from '@/components/assets/AssetsClient';

export const dynamic = 'force-dynamic';

export default async function AssetsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/assets');
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) redirect('/');
  const workspaceId = profile.workspace_id as string;

  const [assets, { data: tourRows }] = await Promise.all([
    loadAssets(supabase, workspaceId),
    supabase.from('tours').select('id, name, artist:artists(name)').eq('workspace_id', workspaceId).order('start_date', { ascending: false }),
  ]);

  const tours = (tourRows ?? []).map((t) => {
    const artist = (Array.isArray(t.artist) ? t.artist[0] : t.artist) as { name?: string | null } | null;
    return { id: t.id as string, label: [artist?.name, t.name].filter(Boolean).join(' · ') || (t.name as string) };
  });

  return <AssetsClient initial={assets} tours={tours} />;
}
