/* LOWPASS — /operations/[tourId]/riders/[id]: an old rider-pack link
   (⌘K, /tours/:id/rider-packs/:packId redirects, bookmarks). A rider is now
   the tour's two documents on one page (Nov 2026 rebuild); a channel list or
   stage plot that came through the same old URL goes to its own page. */

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isUuid } from '@/lib/riders/blocks';

export const dynamic = 'force-dynamic';

export default async function OldRiderPackRoute({ params }: { params: Promise<{ tourId: string; id: string }> }) {
  const { tourId, id } = await params;
  if (isUuid(id)) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.from('rider_packs').select('kind').eq('id', id).maybeSingle<{ kind: string | null }>();
    if (data?.kind === 'channel_list') redirect(`/operations/${tourId}/channel-list`);
    if (data?.kind === 'stage_plot') redirect(`/operations/${tourId}/stage-plot`);
  }
  redirect(`/operations/${tourId}/riders`);
}
