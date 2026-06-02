/* ============================================
   LOWPASS — /artists/[id]/stage-plots/[plotId] (§SP0 wiring)

   The stage plot editor, loaded from the API and auto-saved.
   ============================================ */

import { StagePlotEditorClient } from '@/components/stage-plot/StagePlotEditorClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string; plotId: string }>;
}

export default async function StagePlotEditorPage({ params }: PageProps) {
  const { plotId } = await params;
  return <StagePlotEditorClient plotId={plotId} />;
}
