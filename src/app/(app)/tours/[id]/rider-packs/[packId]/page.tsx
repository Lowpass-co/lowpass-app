/* ============================================
   LOWPASS — Tour Rider-Pack Editor (UX17 §4)

   Pack editor on <DocumentCanvas mode="builder"> with the builder archetype's
   PageShell (LeftRail variant docSections). The R-series PackEditor renders
   its own internal section list and editor surface; the builder canvas just
   provides zoom + grid + chrome consistency with other document surfaces.

   The docSections rail today shows just the active pack as a single entry —
   future enhancement: query the pack's actual section list and let the rail
   navigate between them.
   ============================================ */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { builderAppPageShell, topBarOnlyAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PackEditor } from '@/components/rider-pack/PackEditor';
import { DocumentCanvas } from '@/components/document/DocumentCanvas';
import { TourBreadcrumbServer } from '@/components/tours/TourBreadcrumbServer';

export const dynamic = 'force-dynamic';

export default async function TourRiderPackEditorPage({
  params,
}: {
  params: Promise<{ id: string; packId: string }>;
}) {
  const { id: tourId, packId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id, title, tour_id')
    .eq('id', packId)
    .maybeSingle();

  if (!pack) {
    return topBarOnlyAppPageShell(
      <div className="p-6 text-sm text-lp-text-secondary">Pack not found.</div>,
    );
  }

  if (pack.tour_id && pack.tour_id !== tourId) {
    redirect(`/tours/${pack.tour_id}/rider-packs/${packId}`);
  }

  return builderAppPageShell(
    <div className="flex min-h-0 flex-1 flex-col">
      <TourBreadcrumbServer tourId={tourId} />
      <div className="flex items-center gap-2 border-b border-lp-border bg-lp-surface px-6 py-3 text-sm">
        <Link href={`/tours/${tourId}/rider-packs`} className="text-lp-text-secondary hover:text-lp-text">
          ← Rider packs
        </Link>
        <span className="text-lp-text-tertiary">/</span>
        <span className="font-semibold text-lp-text">{pack.title || '(untitled)'}</span>
      </div>
      <DocumentCanvas mode="builder" minHeight="calc(100vh - var(--lp-page-header-h, 96px))">
        <PackEditor packId={packId} />
      </DocumentCanvas>
    </div>,
    {
      kind: 'docSections',
      sections: [
        {
          id: 'editor',
          label: pack.title || 'Editor',
          href: `/tours/${tourId}/rider-packs/${packId}`,
        },
      ],
      activeId: 'editor',
    },
  );
}
