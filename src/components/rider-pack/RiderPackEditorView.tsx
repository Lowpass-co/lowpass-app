/* ============================================
   LOWPASS — <RiderPackEditorView> — /rider-packs/[id]

   Since the riders rebuild (Nov 2026, migration 301) this is the CHANNEL-LIST
   document editor only (PackEditor mounts ChannelListEditor for it). An old
   RIDER pack opens the new Riders page instead — the tour's, or the artist
   library's for an artist-level pack — and a stage-plot pack opens the
   stage-plot editor. The old rider builder (sections, cover page, show/builder
   tabs, the pack sidebar) is deleted.

   `standalone` wraps it in the canonical shell (<ShellV3Mount>, ARTIST scope —
   the rail lights "Riders & specs"). The pack's artist comes from
   rider_packs.artist_id, or the tour's artist for tour-scoped packs; a pack
   with NO resolvable artist renders inner-only rather than a shell whose rail
   hrefs would be built on null.
   ============================================ */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PackEditor } from '@/components/rider-pack/PackEditor';
import { ShellV3Mount } from '@/components/shell-v3/ShellV3Mount';
import { hasOwnRail } from '@/lib/nav/ia';

export async function RiderPackEditorView({ packId, standalone }: { packId: string; standalone: boolean }) {
  const id = packId;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id, title, kind, scope, artist_id, tour_id')
    .eq('id', id)
    .maybeSingle<{ id: string; title: string | null; kind: string | null; scope: string | null; artist_id: string | null; tour_id: string | null }>();
  if (!pack) notFound();

  if (pack.kind !== 'channel_list') {
    if (pack.kind === 'stage_plot') redirect(pack.tour_id ? `/operations/${pack.tour_id}/stage-plot` : pack.artist_id ? `/artists/${pack.artist_id}/stage-plots` : '/artists');
    redirect(pack.tour_id ? `/operations/${pack.tour_id}/riders` : pack.artist_id ? `/artists/${pack.artist_id}/riders` : '/artists');
  }

  let shellArtistId: string | null = pack.artist_id ?? null;
  if (standalone && !shellArtistId && pack.tour_id) {
    const { data: t } = await supabase.from('tours').select('artist_id').eq('id', pack.tour_id).maybeSingle<{ artist_id: string | null }>();
    shellArtistId = t?.artist_id ?? null;
  }

  const inner = (
    <div>
      <div className="flex items-center gap-2 border-b border-lp-border bg-lp-surface px-6 py-3 text-sm">
        <Link href={shellArtistId ? `/artists/${shellArtistId}/channel-lists` : '/artists'} className="text-lp-text-secondary hover:text-lp-text">
          ← Channel lists
        </Link>
        <span className="text-lp-text-tertiary">/</span>
        <span className="font-semibold text-lp-text">{pack.title || '(untitled)'}</span>
      </div>
      <PackEditor packId={id} />
    </div>
  );

  if (!standalone || !shellArtistId) return inner;
  return (
    <ShellV3Mount pathname={`/rider-packs/${id}`} search="" artistId={shellArtistId} denseRail={hasOwnRail(`/rider-packs/${id}`)}>
      {inner}
    </ShellV3Mount>
  );
}
